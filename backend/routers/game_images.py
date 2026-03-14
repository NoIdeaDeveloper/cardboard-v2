import logging
import mimetypes
import os
import shutil
import urllib.parse
import urllib.request
import uuid
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas
from utils import _is_safe_url

logger = logging.getLogger("cardboard.gallery")
router = APIRouter(prefix="/api/games", tags=["gallery"])

GALLERY_DIR = os.getenv("GALLERY_DIR", "/app/data/gallery")
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def _game_gallery_dir(game_id: int, create: bool = False) -> str:
    path = os.path.join(GALLERY_DIR, str(game_id))
    if create:
        os.makedirs(path, exist_ok=True)
    return path


def _image_file_path(game_id: int, filename: str, create_dir: bool = False) -> str:
    return os.path.join(_game_gallery_dir(game_id, create=create_dir), filename)


def delete_all_gallery_images(game_id: int, db: Session) -> None:
    """Delete all gallery images for a game (files + DB rows). Called on game delete."""
    game_dir = os.path.join(GALLERY_DIR, str(game_id))
    if os.path.isdir(game_dir):
        shutil.rmtree(game_dir, ignore_errors=True)
    db.query(models.GameImage).filter(models.GameImage.game_id == game_id).delete()


def _primary_url(game_id: int, first_img: models.GameImage) -> str:
    return f"/api/games/{game_id}/images/{first_img.id}/file"


def _safe_gallery_ext(url: str, content_type: str) -> str:
    ext = mimetypes.guess_extension(content_type.split(";")[0].strip()) or ""
    if ext in (".jpe", ""):
        url_ext = os.path.splitext(url.split("?")[0])[1].lower()
        ext = url_ext if url_ext in ALLOWED_IMAGE_EXTENSIONS else ".jpg"
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        ext = ".jpg"
    return ext


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/{game_id}/images", response_model=List[schemas.GameImageResponse])
def get_images(game_id: int, db: Session = Depends(get_db)):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return (
        db.query(models.GameImage)
        .filter(models.GameImage.game_id == game_id)
        .order_by(models.GameImage.sort_order)
        .all()
    )


@router.post("/{game_id}/images", response_model=schemas.GameImageResponse, status_code=201)
async def upload_gallery_image(
    game_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)
):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400, detail="Only image files (.jpg, .png, .gif, .webp) are allowed"
        )

    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")

    # Next sort_order
    last = (
        db.query(models.GameImage)
        .filter(models.GameImage.game_id == game_id)
        .order_by(models.GameImage.sort_order.desc())
        .first()
    )
    next_order = (last.sort_order + 1) if last else 0

    filename = f"{uuid.uuid4()}{ext}"
    dest = _image_file_path(game_id, filename, create_dir=True)
    try:
        with open(dest, "wb") as f:
            f.write(content)
    except OSError:
        logger.exception("Failed to write gallery image for game %d", game_id)
        raise HTTPException(status_code=500, detail="Failed to save image to disk")

    db_img = models.GameImage(game_id=game_id, filename=filename, sort_order=next_order)
    db.add(db_img)
    # Flush to get the auto-assigned ID, then update image_url in the same transaction
    db.flush()

    if next_order == 0:
        game.image_url = _primary_url(game_id, db_img)
        game.image_cached = False

    db.commit()
    db.refresh(db_img)

    logger.info("Gallery image uploaded for game %d: %s (order=%d)", game_id, filename, next_order)
    return db_img


@router.get("/{game_id}/images/{img_id}/file")
def get_gallery_image_file(game_id: int, img_id: int, db: Session = Depends(get_db)):
    img = (
        db.query(models.GameImage)
        .filter(models.GameImage.id == img_id, models.GameImage.game_id == game_id)
        .first()
    )
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    path = _image_file_path(game_id, img.filename)
    real = os.path.realpath(path)
    gallery_dir = os.path.realpath(_game_gallery_dir(game_id))
    if not real.startswith(gallery_dir + os.sep):
        raise HTTPException(status_code=404, detail="Image file not found")
    if not os.path.isfile(real):
        raise HTTPException(status_code=404, detail="Image file not found")
    return FileResponse(real)


@router.delete("/{game_id}/images/{img_id}", status_code=204)
def delete_gallery_image(game_id: int, img_id: int, db: Session = Depends(get_db)):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    img = (
        db.query(models.GameImage)
        .filter(models.GameImage.id == img_id, models.GameImage.game_id == game_id)
        .first()
    )
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    was_primary = img.sort_order == 0
    file_path = _image_file_path(game_id, img.filename)

    db.delete(img)
    db.flush()

    # Renumber remaining images
    remaining = (
        db.query(models.GameImage)
        .filter(models.GameImage.game_id == game_id)
        .order_by(models.GameImage.sort_order)
        .all()
    )
    for i, r in enumerate(remaining):
        r.sort_order = i

    # Update game.image_url when the deleted image was the primary
    if was_primary or (game.image_url and f"/images/{img_id}/file" in game.image_url):
        if remaining:
            game.image_url = _primary_url(game_id, remaining[0])
            game.image_cached = False
        else:
            game.image_url = None
            game.image_cached = False

    db.commit()

    # Delete file after DB commit so a commit failure doesn't leave orphaned records
    try:
        os.remove(file_path)
    except OSError:
        logger.warning("Could not delete gallery file %s (game %d)", file_path, game_id)

    logger.info("Gallery image %d deleted for game %d", img_id, game_id)


@router.post("/{game_id}/images/from-url", response_model=schemas.GameImageResponse, status_code=201)
def add_gallery_image_from_url(
    game_id: int, body: schemas.GalleryImageFromUrl, db: Session = Depends(get_db)
):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    parsed = urllib.parse.urlparse(body.url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only http/https URLs are supported")
    if not _is_safe_url(body.url):
        logger.warning("Gallery image from URL rejected: private/loopback URL: %s", body.url)
        raise HTTPException(status_code=400, detail="Private/loopback URLs are not permitted")

    try:
        req = urllib.request.Request(body.url, headers={"User-Agent": "Cardboard/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            content_type = resp.headers.get("Content-Type", "image/jpeg")
            ext = _safe_gallery_ext(body.url, content_type)
            downloaded, chunks = 0, []
            while chunk := resp.read(65536):
                downloaded += len(chunk)
                if downloaded > MAX_IMAGE_SIZE:
                    raise HTTPException(status_code=413, detail="Remote image exceeds 10 MB limit")
                chunks.append(chunk)
            content = b"".join(chunks)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Gallery image download failed for game %d: %s", game_id, exc)
        raise HTTPException(status_code=422, detail="Could not download image from the provided URL")

    last = (
        db.query(models.GameImage)
        .filter(models.GameImage.game_id == game_id)
        .order_by(models.GameImage.sort_order.desc())
        .first()
    )
    next_order = (last.sort_order + 1) if last else 0

    filename = f"{uuid.uuid4()}{ext}"
    file_path = _image_file_path(game_id, filename, create_dir=True)
    try:
        with open(file_path, "wb") as f:
            f.write(content)
    except OSError:
        logger.exception("Failed to write gallery image (from URL) for game %d", game_id)
        raise HTTPException(status_code=500, detail="Failed to save image to disk")

    try:
        db_img = models.GameImage(game_id=game_id, filename=filename, sort_order=next_order)
        db.add(db_img)
        db.flush()

        if next_order == 0:
            game.image_url = _primary_url(game_id, db_img)
            game.image_cached = False

        db.commit()
    except Exception:
        try:
            os.remove(file_path)
        except OSError:
            pass
        raise

    db.refresh(db_img)
    logger.info("Gallery image added from URL for game %d (order=%d)", game_id, next_order)
    return db_img


@router.patch("/{game_id}/images/reorder", status_code=204)
def reorder_gallery_images(
    game_id: int, body: schemas.ReorderImagesBody, db: Session = Depends(get_db)
):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    img_map = {
        img.id: img
        for img in db.query(models.GameImage)
        .filter(models.GameImage.game_id == game_id)
        .all()
    }

    if set(body.order) != set(img_map.keys()):
        raise HTTPException(
            status_code=400,
            detail="order must contain exactly the IDs of all images for this game",
        )

    for i, img_id in enumerate(body.order):
        img_map[img_id].sort_order = i

    # Update game.image_url to new primary
    if body.order:
        game.image_url = _primary_url(game_id, img_map[body.order[0]])
        game.image_cached = False

    db.commit()
    logger.info("Gallery images reordered for game %d", game_id)


@router.patch("/{game_id}/images/{img_id}", response_model=schemas.GameImageResponse)
def update_gallery_image(
    game_id: int, img_id: int, body: schemas.GameImageUpdate, db: Session = Depends(get_db)
):
    img = (
        db.query(models.GameImage)
        .filter(models.GameImage.id == img_id, models.GameImage.game_id == game_id)
        .first()
    )
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    img.caption = (body.caption.strip() or None) if body.caption is not None else None
    db.commit()
    db.refresh(img)
    logger.info("Gallery image %d updated for game %d", img_id, game_id)
    return img
