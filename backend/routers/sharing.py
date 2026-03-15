import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
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


ALLOWED_EXPIRY_MINUTES = (10, 30, 60)


@router.post("/tokens", response_model=schemas.ShareTokenResponse, status_code=201)
def create_token(label: Optional[str] = None, expires_in: Optional[int] = None, db: Session = Depends(get_db)):
    if expires_in is not None and expires_in not in ALLOWED_EXPIRY_MINUTES:
        raise HTTPException(status_code=400, detail=f"expires_in must be one of {ALLOWED_EXPIRY_MINUTES} or omitted")
    token = secrets.token_urlsafe(32)
    expires_at = None
    if expires_in is not None:
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=expires_in)
    share = models.ShareToken(token=token, label=label, expires_at=expires_at)
    db.add(share)
    db.commit()
    db.refresh(share)
    logger.info("Share token created: %s (expires: %s)", token[:8] + "...", expires_at or "never")
    return share


@router.delete("/tokens/{token}", status_code=204)
def delete_token(token: str, db: Session = Depends(get_db)):
    share = db.query(models.ShareToken).filter(models.ShareToken.token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Token not found")
    db.delete(share)
    db.commit()
    logger.info("Share token revoked: %s", token[:8] + "...")


def _validate_token(token: str, db: Session) -> models.ShareToken:
    share = db.query(models.ShareToken).filter(models.ShareToken.token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Invalid share link")
    if share.expires_at:
        exp = share.expires_at if share.expires_at.tzinfo else share.expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > exp:
            raise HTTPException(status_code=404, detail="This share link has expired")
    return share


@router.get("/{token}/games", response_model=List[schemas.GameResponse])
def get_shared_games(token: str, db: Session = Depends(get_db)):
    _validate_token(token, db)
    return _build_game_list(db)


@router.get("/{token}/games/{game_id}", response_model=schemas.GameResponse)
def get_shared_game(token: str, game_id: int, db: Session = Depends(get_db)):
    _validate_token(token, db)
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    _load_tags([game], db)
    return _attach_parent_name(game, db)
