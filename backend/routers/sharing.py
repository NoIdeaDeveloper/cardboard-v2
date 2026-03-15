import json
import logging
import secrets
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas
from routers.games import _load_tags, _attach_parent_name

logger = logging.getLogger("cardboard.sharing")
router = APIRouter(prefix="/api/share", tags=["sharing"])


def _build_game_list(db: Session) -> List[schemas.GameResponse]:
    games = db.query(models.Game).order_by(models.Game.name).all()
    _load_tags(games, db)
    parent_ids = {g.parent_game_id for g in games if g.parent_game_id}
    parent_names = {}
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


@router.get("/tokens", response_model=List[schemas.ShareTokenResponse])
def list_tokens(db: Session = Depends(get_db)):
    return db.query(models.ShareToken).all()


@router.post("/tokens", response_model=schemas.ShareTokenResponse, status_code=201)
def create_token(label: Optional[str] = None, db: Session = Depends(get_db)):
    token = secrets.token_urlsafe(32)
    share = models.ShareToken(token=token, label=label)
    db.add(share)
    db.commit()
    db.refresh(share)
    logger.info("Share token created: %s", token[:8] + "...")
    return share


@router.delete("/tokens/{token}", status_code=204)
def delete_token(token: str, db: Session = Depends(get_db)):
    share = db.query(models.ShareToken).filter(models.ShareToken.token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Token not found")
    db.delete(share)
    db.commit()
    logger.info("Share token revoked: %s", token[:8] + "...")


@router.get("/{token}/games", response_model=List[schemas.GameResponse])
def get_shared_games(token: str, db: Session = Depends(get_db)):
    share = db.query(models.ShareToken).filter(models.ShareToken.token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Invalid share link")
    return _build_game_list(db)


@router.get("/{token}/games/{game_id}", response_model=schemas.GameResponse)
def get_shared_game(token: str, game_id: int, db: Session = Depends(get_db)):
    share = db.query(models.ShareToken).filter(models.ShareToken.token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Invalid share link")
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    _load_tags([game], db)
    return _attach_parent_name(game, db)
