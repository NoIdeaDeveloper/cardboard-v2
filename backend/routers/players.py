import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas

logger = logging.getLogger("cardboard.players")
router = APIRouter(prefix="/api/players", tags=["players"])


@router.get("/", response_model=List[schemas.PlayerResponse])
def get_players(db: Session = Depends(get_db)):
    return db.query(models.Player).order_by(models.Player.name).all()


@router.post("/", response_model=schemas.PlayerResponse, status_code=201)
def create_player(player: schemas.PlayerCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Player).filter(models.Player.name == player.name.strip()).first()
    if existing:
        return existing
    db_player = models.Player(name=player.name.strip())
    db.add(db_player)
    db.commit()
    db.refresh(db_player)
    logger.info("Player created: %r", db_player.name)
    return db_player


@router.delete("/{player_id}", status_code=204)
def delete_player(player_id: int, db: Session = Depends(get_db)):
    player = db.query(models.Player).filter(models.Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    db.delete(player)
    db.commit()
    logger.info("Player deleted: id=%d", player_id)
