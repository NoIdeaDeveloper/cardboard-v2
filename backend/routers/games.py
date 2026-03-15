import glob
import json
import logging
import mimetypes
import os
import re
import sqlite3
import tempfile
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import asc, case, desc, func
from sqlalchemy.orm import Session

from database import SessionLocal, get_db
import models
import schemas
from routers.game_images import delete_all_gallery_images
from utils import _is_safe_url

logger = logging.getLogger("cardboard.games")
router = APIRouter(prefix="/api/games", tags=["games"])

IMAGES_DIR = os.getenv("IMAGES_DIR", "/app/data/images")
INSTRUCTIONS_DIR = os.getenv("INSTRUCTIONS_DIR", "/app/data/instructions")
SCANS_DIR = os.getenv("SCANS_DIR", "/app/data/scans")
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_INSTRUCTIONS_SIZE = 20 * 1024 * 1024  # 20 MB
ALLOWED_INSTRUCTIONS_EXTENSIONS = {".pdf", ".txt"}
MAX_SCAN_SIZE = 200 * 1024 * 1024  # 200 MB
ALLOWED_SCAN_EXTENSIONS = {".usdz"}
ALLOWED_GLB_EXTENSIONS = {".glb"}


# ---------------------------------------------------------------------------
# Image caching
# ---------------------------------------------------------------------------

def _safe_filename(name: str) -> str:
    """Strip path components and replace unsafe characters."""
    name = os.path.basename(name)
    name = re.sub(r"[^\w.\-]", "_", name)
    return name[:200]  # cap length


def _safe_ext(url: str, content_type: str) -> str:
    """Derive a safe file extension from content-type or URL."""
    ext = mimetypes.guess_extension(content_type.split(";")[0].strip()) or ""
    if ext in (".jpe", ""):
        # Fall back to URL extension
        url_ext = os.path.splitext(url.split("?")[0])[1].lower()
        ext = url_ext if url_ext in (".jpg", ".jpeg", ".png", ".gif", ".webp") else ".jpg"
    return ext


def _cache_game_image(game_id: int, image_url: str) -> None:
    """Download image_url and store locally; update game record. Runs as a background task."""
    if not image_url or image_url.startswith("/api/"):
        return  # already local or empty

    parsed = urllib.parse.urlparse(image_url)
    if parsed.scheme not in ("http", "https"):
        logger.warning("Image cache refused for game %d: unsupported scheme %r", game_id, parsed.scheme)
        return
    if not _is_safe_url(image_url):
        logger.warning("Image cache refused for game %d: private/loopback URL", game_id)
        return

    # Abort early if the URL has already been changed (e.g. user uploaded a file
    # or changed the URL before this background task ran).
    with SessionLocal() as db:
        game = db.query(models.Game).filter(models.Game.id == game_id).first()
        if not game or game.image_url != image_url:
            logger.info("Image cache skipped for game %d: URL has changed", game_id)
            return

    os.makedirs(IMAGES_DIR, exist_ok=True)

    try:
        req = urllib.request.Request(image_url, headers={"User-Agent": "Cardboard/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            content_type = resp.headers.get("Content-Type", "image/jpeg")
            ext = _safe_ext(image_url, content_type)
            dest = os.path.join(IMAGES_DIR, f"{game_id}{ext}")
            downloaded = 0
            with open(dest, "wb") as f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    downloaded += len(chunk)
                    if downloaded > MAX_IMAGE_SIZE:
                        raise ValueError("Remote image exceeds size limit")
                    f.write(chunk)
    except Exception:
        logger.exception("Image cache failed for game %d", game_id)
        _delete_cached_image(game_id)  # remove any partial file
        return

    # Verify the URL is still current before updating the DB — the user may have
    # changed or uploaded a new image while we were downloading.
    with SessionLocal() as db:
        game = db.query(models.Game).filter(models.Game.id == game_id).first()
        if game and game.image_url == image_url:
            game.image_url = f"/api/games/{game_id}/image"
            game.image_cached = True
            db.commit()
            logger.info("Image cached for game %d", game_id)
        else:
            _delete_cached_image(game_id)
            logger.info("Image cache discarded for game %d: URL changed during download", game_id)


def _instructions_path(game_id: int, filename: str) -> str:
    return os.path.join(INSTRUCTIONS_DIR, f"{game_id}_{os.path.basename(filename)}")


def _verify_within(path: str, directory: str) -> str:
    """Resolve *path* and verify it lives inside *directory*; raise 404 otherwise."""
    real = os.path.realpath(path)
    if not real.startswith(os.path.realpath(directory) + os.sep):
        raise HTTPException(status_code=404, detail="File not found")
    return real


def _delete_cached_image(game_id: int) -> None:
    for path in glob.glob(os.path.join(IMAGES_DIR, f"{game_id}.*")):
        try:
            os.remove(path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Tag junction-table helpers (dual-write: junction tables + TEXT columns)
# ---------------------------------------------------------------------------

# (game_field, tag_model, pivot_model, fk_attr)
_TAG_FIELDS = [
    ("categories", models.Category, models.GameCategory, "category_id"),
    ("mechanics",  models.Mechanic,  models.GameMechanic,  "mechanic_id"),
    ("designers",  models.Designer,  models.GameDesigner,  "designer_id"),
    ("publishers", models.Publisher, models.GamePublisher, "publisher_id"),
    ("labels",     models.Label,     models.GameLabel,     "label_id"),
]


def _save_tags(game_id: int, data_dict: dict, db: Session) -> None:
    """Sync junction tables for any tag fields present in *data_dict*.

    Also keeps the legacy TEXT columns in sync (dual-write).
    """
    try:
        for field, TagModel, PivotModel, fk_attr in _TAG_FIELDS:
            if field not in data_dict:
                continue
            json_str = data_dict[field]
            try:
                raw = json.loads(json_str) if json_str else []
                if not isinstance(raw, list):
                    continue
                # Deduplicate and clean in one pass
                seen: dict[str, None] = {}
                for n in raw:
                    clean = (str(n) if n else "").strip()
                    if clean:
                        seen[clean] = None
                names = list(seen)
            except (json.JSONDecodeError, TypeError):
                logger.warning("Invalid JSON for tag field %s on game %d: %.80s", field, game_id, str(json_str))
                continue

            # Clear existing pivot rows for this game + tag type
            db.query(PivotModel).filter(PivotModel.game_id == game_id).delete()

            if not names:
                continue

            # Batch-fetch all existing tags in one query
            existing = {
                tag.name: tag
                for tag in db.query(TagModel).filter(TagModel.name.in_(names)).all()
            }

            # Bulk-create any tags that don't exist yet, then flush once for IDs
            new_tags = [TagModel(name=name) for name in names if name not in existing]
            if new_tags:
                db.add_all(new_tags)
                db.flush()
                for tag in new_tags:
                    existing[tag.name] = tag

            # Bulk-insert all pivot rows
            db.add_all([PivotModel(game_id=game_id, **{fk_attr: existing[name].id}) for name in names])

        db.flush()
    except Exception as e:
        db.rollback()
        logger.error("Failed to save tags for game %d: %s", game_id, str(e))
        raise HTTPException(status_code=500, detail=f"Failed to save tags: {str(e)}")


def _load_tags(games, db: Session) -> None:
    """Populate tag TEXT columns on game objects from junction tables (batch).

    Modifies games in-place. Falls back to the existing TEXT column if
    junction tables return nothing for a game (partial-migration safety).
    """
    if not games:
        return
    game_ids = [g.id for g in games]

    for field, TagModel, PivotModel, fk_attr in _TAG_FIELDS:
        # Single batch query per tag type
        rows = (
            db.query(PivotModel.game_id, TagModel.name)
            .join(TagModel, getattr(PivotModel, fk_attr) == TagModel.id)
            .filter(PivotModel.game_id.in_(game_ids))
            .all()
        )
        by_game: dict[int, list[str]] = {}
        for gid, name in rows:
            by_game.setdefault(gid, []).append(name)

        for g in games:
            junction_names = by_game.get(g.id)
            if junction_names is not None:
                setattr(g, field, json.dumps(sorted(junction_names)))
            # else: keep existing TEXT column value (fallback)


# ---------------------------------------------------------------------------
# Collection CRUD
# ---------------------------------------------------------------------------

def _attach_parent_name(game: models.Game, db: Session) -> schemas.GameResponse:
    """Build a GameResponse with parent_game_name populated if applicable."""
    data = schemas.GameResponse.model_validate(game)
    if game.parent_game_id:
        parent = db.query(models.Game).filter(models.Game.id == game.parent_game_id).first()
        data.parent_game_name = parent.name if parent else None
    return data


@router.get("/", response_model=List[schemas.GameResponse])
def get_games(
    search: Optional[str] = None,
    sort_by: Optional[str] = Query(None, pattern="^(name|min_playtime|max_playtime|min_players|max_players|difficulty|user_rating|date_added|last_played|status|purchase_price|purchase_date)$"),
    sort_dir: Optional[str] = Query("asc", pattern="^(asc|desc)$"),
    include_expansions: bool = True,
    db: Session = Depends(get_db),
):
    query = db.query(models.Game)

    if not include_expansions:
        query = query.filter(models.Game.parent_game_id.is_(None))

    if search:
        query = query.filter(models.Game.name.ilike(f"%{search}%"))

    SORT_COLUMNS = {
        "min_playtime": models.Game.min_playtime,
        "max_playtime": models.Game.max_playtime,
        "min_players": models.Game.min_players,
        "max_players": models.Game.max_players,
        "difficulty": models.Game.difficulty,
        "user_rating": models.Game.user_rating,
        "date_added": models.Game.date_added,
        "last_played": models.Game.last_played,
        "status": models.Game.status,
        "purchase_price": models.Game.purchase_price,
        "purchase_date": models.Game.purchase_date,
    }
    if not sort_by or sort_by == 'name':
        sort_column = case(
            (func.lower(models.Game.name).like('the %'), func.substr(models.Game.name, 5)),
            else_=models.Game.name,
        )
    else:
        sort_column = SORT_COLUMNS.get(sort_by, models.Game.name)
    if sort_dir == "desc":
        query = query.order_by(desc(sort_column))
    else:
        query = query.order_by(asc(sort_column))

    games = query.all()

    # Populate tag fields from junction tables
    _load_tags(games, db)

    # Build a parent-name lookup in one query to avoid N+1
    parent_ids = {g.parent_game_id for g in games if g.parent_game_id}
    parent_names: dict[int, str] = {}
    if parent_ids:
        parents = db.query(models.Game.id, models.Game.name).filter(models.Game.id.in_(parent_ids)).all()
        parent_names = {p.id: p.name for p in parents}

    results = []
    for g in games:
        row = schemas.GameResponse.model_validate(g)
        if g.parent_game_id:
            row.parent_game_name = parent_names.get(g.parent_game_id)
        results.append(row)
    return results


# ===== Backup =====

@router.get("/backup")
def download_backup(background_tasks: BackgroundTasks):
    """
    Create a ZIP backup of the database and media files (images, instructions, gallery).
    3D scans are excluded as they can be very large.
    The ZIP is streamed directly — nothing is persisted to disk permanently.
    """
    data_dir = os.getenv("DATA_DIR", "/app/data")
    db_url = os.getenv("DATABASE_URL", "sqlite:///./data/cardboard.db")

    # Strip SQLite URL prefix to get the file path
    db_path = db_url.replace("sqlite+aiosqlite:///", "").replace("sqlite:///", "")
    if not os.path.isabs(db_path):
        db_path = os.path.join("/app", db_path)

    if not os.path.isfile(db_path):
        raise HTTPException(status_code=500, detail=f"Database file not found at {db_path}")

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    zip_filename = f"cardboard-backup-{ts}.zip"

    # Write to a named temp file so FileResponse can seek/stat it
    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    tmp.close()

    # Use SQLite backup API — safe with active connections
    db_tmp = tmp.name + ".db"
    try:
        src = sqlite3.connect(db_path)
        dst = sqlite3.connect(db_tmp)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()

        with zipfile.ZipFile(tmp.name, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(db_tmp, "cardboard.db")
            for subdir in ["images", "instructions", "gallery"]:
                dir_path = os.path.join(data_dir, subdir)
                for f in glob.glob(os.path.join(dir_path, "**"), recursive=True):
                    if os.path.isfile(f):
                        zf.write(f, os.path.relpath(f, data_dir))
    finally:
        if os.path.exists(db_tmp):
            os.remove(db_tmp)

    size_mb = round(os.path.getsize(tmp.name) / 1_048_576, 1)
    logger.info("Backup created: %s (%.1f MB)", zip_filename, size_mb)

    background_tasks.add_task(os.remove, tmp.name)

    return FileResponse(
        tmp.name,
        media_type="application/zip",
        filename=zip_filename,
    )


@router.get("/{game_id}", response_model=schemas.GameResponse)
def get_game(game_id: int, db: Session = Depends(get_db)):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    _load_tags([game], db)
    return _attach_parent_name(game, db)


def _validate_parent_game_id(parent_id: Optional[int], self_id: Optional[int], db: Session) -> None:
    """Validate parent_game_id: must exist, not self, not itself an expansion."""
    if parent_id is None:
        return
    if self_id is not None and parent_id == self_id:
        raise HTTPException(status_code=400, detail="A game cannot be its own parent")
    parent = db.query(models.Game).filter(models.Game.id == parent_id).first()
    if not parent:
        raise HTTPException(status_code=400, detail="Parent game not found")
    if parent.parent_game_id is not None:
        raise HTTPException(status_code=400, detail="Cannot nest expansions — the target game is already an expansion")


@router.post("/", response_model=schemas.GameResponse, status_code=201)
def create_game(
    game: schemas.GameCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    _validate_parent_game_id(game.parent_game_id, None, db)
    data = game.model_dump()

    # Duplicate check: match by BGG ID (if provided) or case-insensitive name
    if data.get("bgg_id"):
        existing = db.query(models.Game).filter(models.Game.bgg_id == data["bgg_id"]).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"A game with BGG ID {data['bgg_id']} already exists ('{existing.name}').",
            )
    else:
        name_lower = (data.get("name") or "").strip().lower()
        existing = db.query(models.Game).filter(
            func.lower(models.Game.name) == name_lower
        ).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"A game named '{existing.name}' already exists.",
            )

    db_game = models.Game(**data)
    db.add(db_game)
    db.flush()
    _save_tags(db_game.id, data, db)
    db.commit()
    db.refresh(db_game)
    _load_tags([db_game], db)
    logger.info("Game added: id=%d name=%r", db_game.id, db_game.name)

    if db_game.image_url and not db_game.image_url.startswith("/api/"):
        background_tasks.add_task(_cache_game_image, db_game.id, db_game.image_url)

    return _attach_parent_name(db_game, db)


@router.patch("/{game_id}", response_model=schemas.GameResponse)
def update_game(
    game_id: int,
    game: schemas.GameUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game:
        raise HTTPException(status_code=404, detail="Game not found")

    update_data = game.model_dump(exclude_unset=True)

    if "parent_game_id" in update_data:
        _validate_parent_game_id(update_data["parent_game_id"], game_id, db)

    # If image_url is being explicitly changed, clean up the old cached file first.
    new_image_url = None
    if "image_url" in update_data:
        new_image_url = update_data["image_url"] or None
        update_data["image_url"] = new_image_url  # normalise empty string → None
        if not new_image_url or not new_image_url.startswith("/api/"):
            _delete_cached_image(game_id)
            db_game.image_cached = False

    for field, value in update_data.items():
        setattr(db_game, field, value)

    _save_tags(game_id, update_data, db)
    db.commit()
    db.refresh(db_game)
    _load_tags([db_game], db)
    logger.info("Game updated: id=%d name=%r", db_game.id, db_game.name)

    if new_image_url and not new_image_url.startswith("/api/"):
        background_tasks.add_task(_cache_game_image, game_id, new_image_url)

    return _attach_parent_name(db_game, db)


@router.delete("/{game_id}", status_code=204)
def delete_game(game_id: int, db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game:
        raise HTTPException(status_code=404, detail="Game not found")

    logger.info("Game deleted: id=%d name=%r", db_game.id, db_game.name)

    # Clean up files
    _delete_cached_image(game_id)
    _delete_scan_file(game_id)
    _delete_glb_file(game_id)
    if db_game.instructions_filename:
        instr_path = _instructions_path(game_id, db_game.instructions_filename)
        try:
            os.remove(instr_path)
        except OSError:
            pass
    delete_all_gallery_images(game_id, db)

    # Detach any expansions that had this game as their parent
    db.query(models.Game).filter(models.Game.parent_game_id == game_id)\
        .update({"parent_game_id": None})

    # Delete associated play sessions
    db.query(models.PlaySession).filter(models.PlaySession.game_id == game_id).delete()

    db.delete(db_game)
    db.commit()


# ---------------------------------------------------------------------------
# Cached image endpoint
# ---------------------------------------------------------------------------

@router.get("/{game_id}/image")
def get_game_image(game_id: int):
    matches = sorted(glob.glob(os.path.join(IMAGES_DIR, f"{game_id}.*")))
    if not matches:
        raise HTTPException(status_code=404, detail="Image not cached")
    return FileResponse(matches[0], headers={"Cache-Control": "public, max-age=604800"})


# ---------------------------------------------------------------------------
# Image upload endpoint
# ---------------------------------------------------------------------------

@router.post("/{game_id}/image", status_code=204)
async def upload_image(game_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game:
        raise HTTPException(status_code=404, detail="Game not found")

    safe_name = _safe_filename(file.filename or "image.jpg")
    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only image files (.jpg, .png, .gif, .webp) are allowed")

    await file.seek(0, 2)
    if await file.tell() > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")
    await file.seek(0)
    content = await file.read()

    os.makedirs(IMAGES_DIR, exist_ok=True)
    _delete_cached_image(game_id)

    dest = os.path.join(IMAGES_DIR, f"{game_id}{ext}")
    try:
        with open(dest, "wb") as f:
            f.write(content)
    except OSError:
        logger.exception("Failed to write image for game %d", game_id)
        raise HTTPException(status_code=500, detail="Failed to save image to disk")

    db_game.image_url = f"/api/games/{game_id}/image"
    db_game.image_cached = True
    db.commit()
    logger.info("Image uploaded for game %d: %s", game_id, safe_name)


@router.delete("/{game_id}/image", status_code=204)
def delete_image(game_id: int, db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game:
        raise HTTPException(status_code=404, detail="Game not found")

    _delete_cached_image(game_id)
    db_game.image_url = None
    db_game.image_cached = False
    db.commit()
    logger.info("Image deleted for game %d", game_id)


# ---------------------------------------------------------------------------
# Instructions endpoints
# ---------------------------------------------------------------------------

@router.post("/{game_id}/instructions", status_code=204)
async def upload_instructions(game_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game:
        raise HTTPException(status_code=404, detail="Game not found")

    safe_name = _safe_filename(file.filename or "instructions")
    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in ALLOWED_INSTRUCTIONS_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only .pdf and .txt files are allowed")

    await file.seek(0, 2)
    if await file.tell() > MAX_INSTRUCTIONS_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")
    await file.seek(0)
    content = await file.read()

    os.makedirs(INSTRUCTIONS_DIR, exist_ok=True)

    # Remove old file if present
    if db_game.instructions_filename:
        old_path = _instructions_path(game_id, db_game.instructions_filename)
        try:
            os.remove(old_path)
        except OSError:
            pass

    dest = _instructions_path(game_id, safe_name)
    try:
        with open(dest, "wb") as f:
            f.write(content)
    except OSError:
        logger.exception("Failed to write instructions for game %d", game_id)
        raise HTTPException(status_code=500, detail="Failed to save instructions to disk")

    db_game.instructions_filename = safe_name
    db.commit()
    logger.info("Instructions uploaded for game %d: %s", game_id, safe_name)


@router.get("/{game_id}/instructions")
def get_instructions(game_id: int, db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game or not db_game.instructions_filename:
        raise HTTPException(status_code=404, detail="No instructions uploaded")

    path = _instructions_path(game_id, db_game.instructions_filename)
    path = _verify_within(path, INSTRUCTIONS_DIR)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Instructions file not found")

    ext = os.path.splitext(db_game.instructions_filename)[1].lower()
    media_type = "application/pdf" if ext == ".pdf" else "text/plain"
    disposition = "inline" if ext == ".pdf" else "attachment"

    return FileResponse(
        path,
        media_type=media_type,
        headers={
            "Content-Disposition": f'{disposition}; filename="{db_game.instructions_filename}"',
            "Cache-Control": "public, max-age=604800",
        },
    )


@router.delete("/{game_id}/instructions", status_code=204)
def delete_instructions(game_id: int, db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game or not db_game.instructions_filename:
        raise HTTPException(status_code=404, detail="No instructions to delete")

    path = _instructions_path(game_id, db_game.instructions_filename)
    try:
        os.remove(path)
    except OSError:
        pass

    db_game.instructions_filename = None
    db.commit()
    logger.info("Instructions deleted for game %d", game_id)


# ---------------------------------------------------------------------------
# 3D scan endpoints
# ---------------------------------------------------------------------------

def _delete_scan_file(game_id: int) -> None:
    path = os.path.join(SCANS_DIR, f"{game_id}.usdz")
    try:
        os.remove(path)
    except OSError:
        pass


def _delete_glb_file(game_id: int) -> None:
    path = os.path.join(SCANS_DIR, f"{game_id}.glb")
    try:
        os.remove(path)
    except OSError:
        pass


@router.post("/{game_id}/scan", status_code=204)
async def upload_scan(game_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game:
        raise HTTPException(status_code=404, detail="Game not found")

    safe_name = _safe_filename(file.filename or "scan.usdz")
    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in ALLOWED_SCAN_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only .usdz files are allowed")

    await file.seek(0, 2)
    if await file.tell() > MAX_SCAN_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 200 MB limit")
    await file.seek(0)
    content = await file.read()

    os.makedirs(SCANS_DIR, exist_ok=True)
    _delete_scan_file(game_id)

    dest = os.path.join(SCANS_DIR, f"{game_id}.usdz")
    try:
        with open(dest, "wb") as f:
            f.write(content)
    except OSError:
        logger.exception("Failed to write USDZ scan for game %d", game_id)
        raise HTTPException(status_code=500, detail="Failed to save scan to disk")

    db_game.scan_filename = safe_name
    db.commit()
    logger.info("3D scan uploaded for game %d: %s", game_id, safe_name)


@router.get("/{game_id}/scan")
def get_scan(game_id: int, db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game or not db_game.scan_filename:
        raise HTTPException(status_code=404, detail="No 3D scan uploaded")

    path = os.path.join(SCANS_DIR, f"{game_id}.usdz")
    path = _verify_within(path, SCANS_DIR)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="3D scan file not found")

    return FileResponse(
        path,
        media_type="model/vnd.usdz+zip",
        headers={
            "Content-Disposition": f'inline; filename="{db_game.scan_filename}"',
            "Cache-Control": "public, max-age=604800",
        },
    )


@router.delete("/{game_id}/scan", status_code=204)
def delete_scan(game_id: int, db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game or not db_game.scan_filename:
        raise HTTPException(status_code=404, detail="No 3D scan to delete")

    _delete_scan_file(game_id)
    db_game.scan_filename = None
    if not db_game.scan_glb_filename:
        db_game.scan_featured = False
    db.commit()
    logger.info("3D scan deleted for game %d", game_id)


# ---------------------------------------------------------------------------
# GLB scan endpoints
# ---------------------------------------------------------------------------

@router.post("/{game_id}/scan/glb", status_code=204)
async def upload_scan_glb(game_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game:
        raise HTTPException(status_code=404, detail="Game not found")

    safe_name = _safe_filename(file.filename or "scan.glb")
    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in ALLOWED_GLB_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only .glb files are allowed")

    await file.seek(0, 2)
    if await file.tell() > MAX_SCAN_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 200 MB limit")
    await file.seek(0)
    content = await file.read()

    os.makedirs(SCANS_DIR, exist_ok=True)
    _delete_glb_file(game_id)

    dest = os.path.join(SCANS_DIR, f"{game_id}.glb")
    try:
        with open(dest, "wb") as f:
            f.write(content)
    except OSError:
        logger.exception("Failed to write GLB scan for game %d", game_id)
        raise HTTPException(status_code=500, detail="Failed to save scan to disk")

    db_game.scan_glb_filename = safe_name
    db.commit()
    logger.info("GLB scan uploaded for game %d: %s", game_id, safe_name)


@router.get("/{game_id}/scan/glb")
def get_scan_glb(game_id: int, db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game or not db_game.scan_glb_filename:
        raise HTTPException(status_code=404, detail="No GLB scan uploaded")

    path = os.path.join(SCANS_DIR, f"{game_id}.glb")
    path = _verify_within(path, SCANS_DIR)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="GLB file not found")

    return FileResponse(
        path,
        media_type="model/gltf-binary",
        headers={
            "Content-Disposition": f'inline; filename="{db_game.scan_glb_filename}"',
            "Cache-Control": "public, max-age=604800",
        },
    )


@router.delete("/{game_id}/scan/glb", status_code=204)
def delete_scan_glb(game_id: int, db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game or not db_game.scan_glb_filename:
        raise HTTPException(status_code=404, detail="No GLB scan to delete")

    _delete_glb_file(game_id)
    db_game.scan_glb_filename = None
    if not db_game.scan_filename:
        db_game.scan_featured = False
    db.commit()
    logger.info("GLB scan deleted for game %d", game_id)


# ===== BGG XML Import =====

BGG_IMPORT_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/import/bgg")
async def import_bgg(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Import a BoardGameGeek XML collection export (collectionlist format)."""
    content = await file.read(BGG_IMPORT_MAX_BYTES + 1)
    if len(content) > BGG_IMPORT_MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid XML: {exc}")

    # BGG exports use <items> as root with <item> children, or <boardgames> with <boardgame>
    items = root.findall("item") or root.findall("boardgame")
    if not items:
        raise HTTPException(status_code=400, detail="No game items found in XML — is this a BGG collection export?")

    results = {"imported": 0, "skipped": 0, "errors": []}

    for item in items:
        try:
            # Name: BGG exports have <name sortindex="1">Title</name>
            name_el = item.find("name[@sortindex='1']") or item.find("name")
            name = (name_el.text or "").strip() if name_el is not None else ""
            if not name:
                results["skipped"] += 1
                continue

            # Skip duplicates (case-insensitive)
            if db.query(models.Game).filter(
                models.Game.name.ilike(name)
            ).first():
                results["skipped"] += 1
                continue

            # Status
            status_el = item.find("status")
            status = "owned"
            if status_el is not None:
                if status_el.get("wishlist") == "1":
                    status = "wishlist"
                elif status_el.get("prevowned") == "1":
                    status = "sold"

            # Year
            year_text = item.findtext("yearpublished", "").strip()
            try:
                year = int(year_text) or None
            except ValueError:
                year = None

            # Players / playtime from <stats> attributes
            stats_el = item.find("stats")
            def _int_attr(el, attr):
                if el is None:
                    return None
                try:
                    v = int(el.get(attr, "0") or "0")
                    return v if v > 0 else None
                except ValueError:
                    return None

            min_players  = _int_attr(stats_el, "minplayers")
            max_players  = _int_attr(stats_el, "maxplayers")
            min_playtime = _int_attr(stats_el, "minplaytime")
            max_playtime = _int_attr(stats_el, "maxplaytime")

            # BGG object ID
            bgg_id = None
            try:
                bgg_id_str = item.get("objectid") or ""
                bgg_id = int(bgg_id_str) if bgg_id_str else None
            except (ValueError, TypeError):
                pass

            # User rating
            user_rating = None
            bgg_rating = None
            rating_el = item.find(".//stats/rating") if stats_el is not None else None
            if rating_el is not None:
                val = rating_el.get("value", "N/A")
                if val not in ("N/A", "0", ""):
                    try:
                        user_rating = round(min(10.0, max(1.0, float(val))), 1)
                    except ValueError:
                        pass
                # BGG community average
                avg_el = rating_el.find("average")
                if avg_el is not None:
                    try:
                        avg_val = float(avg_el.get("value", "0") or "0")
                        bgg_rating = round(min(10.0, max(1.0, avg_val)), 2) if avg_val > 0 else None
                    except (ValueError, TypeError):
                        pass

            # Notes / comment
            notes = (item.findtext("comment") or "").strip() or None

            # Image URL
            image_url = (item.findtext("image") or "").strip()
            if image_url.startswith("//"):
                image_url = "https:" + image_url
            image_url = image_url or None

            game = models.Game(
                name=name,
                status=status,
                year_published=year,
                min_players=min_players,
                max_players=max_players,
                min_playtime=min_playtime,
                max_playtime=max_playtime,
                user_rating=user_rating,
                bgg_id=bgg_id,
                bgg_rating=bgg_rating,
                user_notes=notes,
                image_url=image_url,
            )
            db.add(game)
            results["imported"] += 1

        except Exception as exc:  # noqa: BLE001
            results["errors"].append(str(exc))

    db.commit()
    logger.info("BGG import: imported=%d skipped=%d errors=%d", results["imported"], results["skipped"], len(results["errors"]))
    return results


# ===== BGG Metadata Refresh =====

BGG_API_URL = "https://boardgamegeek.com/xmlapi2/thing?id={bgg_id}&stats=1"
BGG_SEARCH_URL = "https://boardgamegeek.com/xmlapi2/search?query={query}&type=boardgame&exact=1"


def _fetch_bgg_thing(bgg_id: int) -> Optional[ET.Element]:
    """Fetch BGG XML for a thing ID. Returns the <item> element or None."""
    url = BGG_API_URL.format(bgg_id=bgg_id)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Cardboard/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            content = resp.read(5 * 1024 * 1024)
        root = ET.fromstring(content)
        return root.find("item")
    except Exception as exc:
        logger.warning("BGG fetch failed for id=%d: %s", bgg_id, exc)
        return None


def _parse_bgg_item(item: ET.Element) -> dict:
    """Extract game fields from a BGG <item> element."""
    def _int_val(tag, attr="value"):
        el = item.find(tag)
        if el is None:
            return None
        try:
            v = int(el.get(attr, "0") or el.text or "0")
            return v if v > 0 else None
        except (ValueError, TypeError):
            return None

    def _float_val(tag, attr="value"):
        el = item.find(tag)
        if el is None:
            return None
        try:
            return float(el.get(attr) or el.text or "")
        except (ValueError, TypeError):
            return None

    # Primary name
    name_el = item.find("name[@type='primary']") or item.find("name")
    name = name_el.get("value", "").strip() if name_el is not None else ""

    # Description
    desc_el = item.find("description")
    description = (desc_el.text or "").strip()[:5000] if desc_el is not None else None

    # Year
    year = _int_val("yearpublished")

    # Players / playtime / difficulty
    min_players = _int_val("minplayers")
    max_players = _int_val("maxplayers")
    min_playtime = _int_val("minplaytime")
    max_playtime = _int_val("maxplaytime")

    difficulty = None
    weight_el = item.find(".//averageweight")
    if weight_el is not None:
        try:
            w = float(weight_el.get("value", "0"))
            difficulty = round(min(5.0, max(1.0, w)), 2) if w > 0 else None
        except (ValueError, TypeError):
            pass

    # BGG community rating
    bgg_rating = None
    avg_el = item.find(".//average")
    if avg_el is not None:
        try:
            r = float(avg_el.get("value", "0"))
            bgg_rating = round(min(10.0, max(1.0, r)), 2) if r > 0 else None
        except (ValueError, TypeError):
            pass

    # Tags
    def _links(link_type):
        return json.dumps([el.get("value", "") for el in item.findall(f"link[@type='{link_type}']") if el.get("value")])

    categories = _links("boardgamecategory")
    mechanics = _links("boardgamemechanic")
    designers = _links("boardgamedesigner")
    publishers = _links("boardgamepublisher")

    # Image
    img_el = item.find("image")
    image_url = (img_el.text or "").strip() if img_el is not None else None
    if image_url and image_url.startswith("//"):
        image_url = "https:" + image_url

    return {
        "name": name,
        "description": description,
        "year_published": year,
        "min_players": min_players,
        "max_players": max_players,
        "min_playtime": min_playtime,
        "max_playtime": max_playtime,
        "difficulty": difficulty,
        "bgg_rating": bgg_rating,
        "categories": categories,
        "mechanics": mechanics,
        "designers": designers,
        "publishers": publishers,
        "image_url": image_url,
    }


@router.post("/{game_id}/refresh-bgg", response_model=schemas.GameResponse)
def refresh_from_bgg(
    game_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Re-fetch metadata from BGG and update the game record."""
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game:
        raise HTTPException(status_code=404, detail="Game not found")
    if not db_game.bgg_id:
        raise HTTPException(status_code=400, detail="Game has no BGG ID — add it manually first")

    item = _fetch_bgg_thing(db_game.bgg_id)
    if item is None:
        raise HTTPException(status_code=502, detail="Could not fetch data from BoardGameGeek")

    data = _parse_bgg_item(item)
    tag_data = {k: data.pop(k) for k in ["categories", "mechanics", "designers", "publishers"]}

    for field, value in data.items():
        if value is not None:
            setattr(db_game, field, value)

    db.flush()
    _save_tags(game_id, tag_data, db)
    db.commit()
    db.refresh(db_game)
    _load_tags([db_game], db)

    new_image = db_game.image_url
    if new_image and not new_image.startswith("/api/"):
        background_tasks.add_task(_cache_game_image, game_id, new_image)

    logger.info("BGG refresh: game_id=%d bgg_id=%d", game_id, db_game.bgg_id)
    return _attach_parent_name(db_game, db)


# ===== Game Night Suggest =====

@router.post("/suggest", response_model=List[schemas.GameSuggestion])
def suggest_games(body: schemas.SuggestRequest, db: Session = Depends(get_db)):
    """Return up to 5 game suggestions ranked for a game night."""
    from datetime import date, timedelta
    from routers.sessions import _get_session_players  # avoid circular at module level

    query = db.query(models.Game).filter(
        models.Game.status == "owned",
        models.Game.parent_game_id.is_(None),
    )

    if body.player_count:
        query = query.filter(
            (models.Game.min_players.is_(None)) | (models.Game.min_players <= body.player_count),
            (models.Game.max_players.is_(None)) | (models.Game.max_players >= body.player_count),
        )

    if body.max_minutes:
        query = query.filter(
            (models.Game.min_playtime.is_(None)) | (models.Game.min_playtime <= body.max_minutes),
        )

    games = query.all()

    # Count sessions per game
    from sqlalchemy import func as sqlfunc
    session_counts = {
        row.game_id: row.count
        for row in db.query(
            models.PlaySession.game_id,
            sqlfunc.count(models.PlaySession.id).label("count")
        ).group_by(models.PlaySession.game_id).all()
    }

    today = date.today()
    recent_cutoff = today - timedelta(days=30)

    scored = []
    for g in games:
        score = 0.0
        reasons = []
        count = session_counts.get(g.id, 0)

        if count == 0:
            score += 3
            reasons.append("Never Played")

        if g.user_rating:
            score += g.user_rating / 2
            if g.user_rating >= 8:
                reasons.append("High Rating")

        if g.last_played and g.last_played >= recent_cutoff:
            score -= 1  # played recently, penalise slightly
        elif count > 0 and g.last_played:
            reasons.append("Long Overdue" if (today - g.last_played).days > 180 else "Not Recently Played")

        if body.max_minutes and g.min_playtime and g.min_playtime <= body.max_minutes // 2:
            reasons.append("Quick Game")

        if g.difficulty and g.difficulty <= 2.0:
            reasons.append("Easy to Learn")

        scored.append((score, g, reasons))

    scored.sort(key=lambda x: -x[0])

    results = []
    for score, g, reasons in scored[:5]:
        results.append(schemas.GameSuggestion(
            id=g.id,
            name=g.name,
            image_url=g.image_url,
            min_players=g.min_players,
            max_players=g.max_players,
            min_playtime=g.min_playtime,
            max_playtime=g.max_playtime,
            difficulty=g.difficulty,
            user_rating=g.user_rating,
            last_played=g.last_played,
            reasons=reasons[:3],
        ))
    return results


# ===== BGG Play History Import =====

BGG_PLAYS_MAX_BYTES = 20 * 1024 * 1024


@router.post("/import/bgg-plays")
async def import_bgg_plays(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Import play history from a BGG plays XML export."""
    from routers.sessions import _sync_last_played

    content = await file.read(BGG_PLAYS_MAX_BYTES + 1)
    if len(content) > BGG_PLAYS_MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 20 MB)")

    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid XML: {exc}")

    plays = root.findall("play")
    if not plays:
        raise HTTPException(status_code=400, detail="No play records found — is this a BGG plays export?")

    results = {"imported": 0, "skipped": 0, "errors": []}

    for play in plays:
        try:
            item_el = play.find("item")
            if item_el is None:
                results["skipped"] += 1
                continue

            game_name = (item_el.get("name") or "").strip()
            bgg_object_id = item_el.get("objectid")

            # Match game by bgg_id first, then by name
            game = None
            if bgg_object_id:
                try:
                    game = db.query(models.Game).filter(models.Game.bgg_id == int(bgg_object_id)).first()
                except (ValueError, TypeError):
                    pass
            if not game and game_name:
                game = db.query(models.Game).filter(models.Game.name.ilike(game_name)).first()

            if not game:
                results["skipped"] += 1
                continue

            date_str = play.get("date", "")
            try:
                from datetime import date as date_cls
                played_at = date_cls.fromisoformat(date_str)
            except (ValueError, TypeError):
                results["skipped"] += 1
                continue

            quantity = int(play.get("quantity", "1") or "1")
            player_count = None
            players_el = play.find("players")
            if players_el is not None:
                player_count = len(players_el.findall("player")) or None

            duration = None
            try:
                dur = int(play.get("length", "0") or "0")
                duration = dur if dur > 0 else None
            except (ValueError, TypeError):
                pass

            comment = (play.findtext("comments") or "").strip() or None

            for _ in range(quantity):
                db_session = models.PlaySession(
                    game_id=game.id,
                    played_at=played_at,
                    player_count=player_count,
                    duration_minutes=duration,
                    notes=comment,
                )
                db.add(db_session)
                results["imported"] += 1

        except Exception as exc:
            results["errors"].append(str(exc))

    db.commit()

    # Sync last_played for all affected games
    affected_game_ids = set()
    for play in plays:
        item_el = play.find("item")
        if item_el is None:
            continue
        bgg_object_id = item_el.get("objectid")
        game_name = (item_el.get("name") or "").strip()
        game = None
        if bgg_object_id:
            try:
                game = db.query(models.Game).filter(models.Game.bgg_id == int(bgg_object_id)).first()
            except (ValueError, TypeError):
                pass
        if not game and game_name:
            game = db.query(models.Game).filter(models.Game.name.ilike(game_name)).first()
        if game:
            affected_game_ids.add(game.id)

    for gid in affected_game_ids:
        _sync_last_played(gid, db)

    logger.info("BGG plays import: imported=%d skipped=%d errors=%d", results["imported"], results["skipped"], len(results["errors"]))
    return results


# ===== CSV Import =====

import csv
import io


@router.post("/import/csv")
async def import_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Import games from a CSV file. Columns: name, status, user_rating, notes, labels, categories, mechanics."""
    content = await file.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 5 MB)")

    try:
        text_content = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text_content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {exc}")

    results = {"imported": 0, "skipped": 0, "errors": []}

    VALID_STATUSES = {"owned", "wishlist", "sold"}

    for row in reader:
        try:
            name = (row.get("name") or row.get("Name") or "").strip()
            if not name:
                results["skipped"] += 1
                continue

            if db.query(models.Game).filter(models.Game.name.ilike(name)).first():
                results["skipped"] += 1
                continue

            status_raw = (row.get("status") or row.get("Status") or "owned").strip().lower()
            status = status_raw if status_raw in VALID_STATUSES else "owned"

            user_rating = None
            rating_raw = (row.get("user_rating") or row.get("rating") or "").strip()
            if rating_raw:
                try:
                    user_rating = round(min(10.0, max(1.0, float(rating_raw))), 1)
                except ValueError:
                    pass

            notes = (row.get("notes") or row.get("comment") or "").strip() or None

            def _csv_to_json(val):
                val = (val or "").strip()
                if not val:
                    return None
                items = [x.strip() for x in val.split(";") if x.strip()]
                return json.dumps(items) if items else None

            categories = _csv_to_json(row.get("categories") or row.get("Categories"))
            mechanics = _csv_to_json(row.get("mechanics") or row.get("Mechanics"))
            labels = _csv_to_json(row.get("labels") or row.get("Labels"))

            game = models.Game(
                name=name,
                status=status,
                user_rating=user_rating,
                user_notes=notes,
                categories=categories,
                mechanics=mechanics,
                labels=labels,
            )
            db.add(game)
            db.flush()

            tag_data = {}
            if categories:
                tag_data["categories"] = categories
            if mechanics:
                tag_data["mechanics"] = mechanics
            if labels:
                tag_data["labels"] = labels
            if tag_data:
                _save_tags(game.id, tag_data, db)

            results["imported"] += 1

        except Exception as exc:
            results["errors"].append(str(exc))

    db.commit()
    logger.info("CSV import: imported=%d skipped=%d errors=%d", results["imported"], results["skipped"], len(results["errors"]))
    return results
