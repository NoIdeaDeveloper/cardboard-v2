import glob
import logging
import mimetypes
import os
import re
import urllib.parse
import urllib.request
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import asc, case, desc, func
from sqlalchemy.orm import Session

from database import SessionLocal, get_db
import models
import schemas
from routers.game_images import delete_all_gallery_images

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

    # Abort early if the URL has already been changed (e.g. user uploaded a file
    # or changed the URL before this background task ran).
    db = SessionLocal()
    try:
        game = db.query(models.Game).filter(models.Game.id == game_id).first()
        if not game or game.image_url != image_url:
            logger.info("Image cache skipped for game %d: URL has changed", game_id)
            return
    finally:
        db.close()

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
    except Exception as exc:
        logger.warning("Image cache failed for game %d: %s", game_id, exc)
        return

    # Verify the URL is still current before updating the DB — the user may have
    # changed or uploaded a new image while we were downloading.
    db = SessionLocal()
    try:
        game = db.query(models.Game).filter(models.Game.id == game_id).first()
        if game and game.image_url == image_url:
            game.image_url = f"/api/games/{game_id}/image"
            game.image_cached = True
            db.commit()
            logger.info("Image cached for game %d", game_id)
        else:
            _delete_cached_image(game_id)
            logger.info("Image cache discarded for game %d: URL changed during download", game_id)
    finally:
        db.close()


def _instructions_path(game_id: int, filename: str) -> str:
    return os.path.join(INSTRUCTIONS_DIR, f"{game_id}_{os.path.basename(filename)}")


def _delete_cached_image(game_id: int) -> None:
    for path in glob.glob(os.path.join(IMAGES_DIR, f"{game_id}.*")):
        try:
            os.remove(path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Collection CRUD
# ---------------------------------------------------------------------------

@router.get("/", response_model=List[schemas.GameResponse])
def get_games(
    search: Optional[str] = None,
    sort_by: Optional[str] = Query(None, pattern="^(name|min_playtime|max_playtime|min_players|max_players|difficulty|user_rating|date_added|last_played|status|purchase_price|purchase_date)$"),
    sort_dir: Optional[str] = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
):
    query = db.query(models.Game)

    if search:
        query = query.filter(models.Game.name.ilike(f"%{search}%"))

    if not sort_by or sort_by == 'name':
        sort_column = case(
            (func.lower(models.Game.name).like('the %'), func.substr(models.Game.name, 5)),
            else_=models.Game.name,
        )
    else:
        sort_column = getattr(models.Game, sort_by, models.Game.name)
    if sort_dir == "desc":
        query = query.order_by(desc(sort_column))
    else:
        query = query.order_by(asc(sort_column))

    return query.all()


@router.get("/{game_id}", response_model=schemas.GameResponse)
def get_game(game_id: int, db: Session = Depends(get_db)):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return game


@router.post("/", response_model=schemas.GameResponse, status_code=201)
def create_game(
    game: schemas.GameCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    db_game = models.Game(**game.model_dump())
    db.add(db_game)
    db.commit()
    db.refresh(db_game)
    logger.info("Game added: id=%d name=%r", db_game.id, db_game.name)

    if db_game.image_url and not db_game.image_url.startswith("/api/"):
        background_tasks.add_task(_cache_game_image, db_game.id, db_game.image_url)

    return db_game


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

    # If image_url is being explicitly changed, clean up the old cached file first.
    if "image_url" in update_data:
        new_image_url = update_data["image_url"] or None
        update_data["image_url"] = new_image_url  # normalise empty string → None
        if not new_image_url or not new_image_url.startswith("/api/"):
            _delete_cached_image(game_id)
            db_game.image_cached = False
    else:
        new_image_url = None

    for field, value in update_data.items():
        setattr(db_game, field, value)

    db.commit()
    db.refresh(db_game)

    if new_image_url and not new_image_url.startswith("/api/"):
        background_tasks.add_task(_cache_game_image, game_id, new_image_url)

    return db_game


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
    return FileResponse(matches[0])


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

    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")

    os.makedirs(IMAGES_DIR, exist_ok=True)
    _delete_cached_image(game_id)

    dest = os.path.join(IMAGES_DIR, f"{game_id}{ext}")
    with open(dest, "wb") as f:
        f.write(content)

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

    content = await file.read()
    if len(content) > MAX_INSTRUCTIONS_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")

    os.makedirs(INSTRUCTIONS_DIR, exist_ok=True)

    # Remove old file if present
    if db_game.instructions_filename:
        old_path = _instructions_path(game_id, db_game.instructions_filename)
        try:
            os.remove(old_path)
        except OSError:
            pass

    dest = _instructions_path(game_id, safe_name)
    with open(dest, "wb") as f:
        f.write(content)

    db_game.instructions_filename = safe_name
    db.commit()
    logger.info("Instructions uploaded for game %d: %s", game_id, safe_name)


@router.get("/{game_id}/instructions")
def get_instructions(game_id: int, db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game or not db_game.instructions_filename:
        raise HTTPException(status_code=404, detail="No instructions uploaded")

    path = _instructions_path(game_id, db_game.instructions_filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Instructions file not found")

    ext = os.path.splitext(db_game.instructions_filename)[1].lower()
    media_type = "application/pdf" if ext == ".pdf" else "text/plain"
    disposition = "inline" if ext == ".pdf" else "attachment"

    return FileResponse(
        path,
        media_type=media_type,
        headers={"Content-Disposition": f'{disposition}; filename="{db_game.instructions_filename}"'},
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

    content = await file.read()
    if len(content) > MAX_SCAN_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 200 MB limit")

    os.makedirs(SCANS_DIR, exist_ok=True)
    _delete_scan_file(game_id)

    dest = os.path.join(SCANS_DIR, f"{game_id}.usdz")
    with open(dest, "wb") as f:
        f.write(content)

    db_game.scan_filename = safe_name
    db.commit()
    logger.info("3D scan uploaded for game %d: %s", game_id, safe_name)


@router.get("/{game_id}/scan")
def get_scan(game_id: int, db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game or not db_game.scan_filename:
        raise HTTPException(status_code=404, detail="No 3D scan uploaded")

    path = os.path.join(SCANS_DIR, f"{game_id}.usdz")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="3D scan file not found")

    return FileResponse(
        path,
        media_type="model/vnd.usdz+zip",
        headers={"Content-Disposition": f'inline; filename="{db_game.scan_filename}"'},
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

    content = await file.read()
    if len(content) > MAX_SCAN_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 200 MB limit")

    os.makedirs(SCANS_DIR, exist_ok=True)
    _delete_glb_file(game_id)

    dest = os.path.join(SCANS_DIR, f"{game_id}.glb")
    with open(dest, "wb") as f:
        f.write(content)

    db_game.scan_glb_filename = safe_name
    db.commit()
    logger.info("GLB scan uploaded for game %d: %s", game_id, safe_name)


@router.get("/{game_id}/scan/glb")
def get_scan_glb(game_id: int, db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game or not db_game.scan_glb_filename:
        raise HTTPException(status_code=404, detail="No GLB scan uploaded")

    path = os.path.join(SCANS_DIR, f"{game_id}.glb")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="GLB file not found")

    return FileResponse(
        path,
        media_type="model/gltf-binary",
        headers={"Content-Disposition": f'inline; filename="{db_game.scan_glb_filename}"'},
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
