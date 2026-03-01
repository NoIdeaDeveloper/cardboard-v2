import logging
import os
import shutil
import uuid
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas

logger = logging.getLogger("cardboard.gallery")
router = APIRouter(prefix="/api/games", tags=["gallery"])

GALLERY_DIR = os.getenv("GALLERY_DIR", "/app/data/gallery")
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def _game_gallery_dir(game_id: int) -> str:
    path = os.path.join(GALLERY_DIR, str(game_id))
    os.makedirs(path, exist_ok=True)
    return path


def _image_file_path(game_id: int, filename: str) -> str:
    return os.path.join(_game_gallery_dir(game_id), filename)


def delete_all_gallery_images(game_id: int, db: Session) -> None:
    """Delete all gallery images for a game (files + DB rows). Called on game delete."""
    game_dir = os.path.join(GALLERY_DIR, str(game_id))
    if os.path.isdir(game_dir):
        shutil.rmtree(game_dir, ignore_errors=True)
    db.query(models.GameImage).filter(models.GameImage.game_id == game_id).delete()


def _primary_url(game_id: int, first_img: models.GameImage) -> str:
    return f"/api/games/{game_id}/images/{first_img.id}/file"


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
    dest = _image_file_path(game_id, filename)
    with open(dest, "wb") as f:
        f.write(content)

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
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Image file not found")
    return FileResponse(path)


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
