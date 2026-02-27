import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import asc, desc
from typing import List, Optional

from database import get_db
import models
import schemas

logger = logging.getLogger("cardboard.games")
router = APIRouter(prefix="/api/games", tags=["games"])


@router.get("/", response_model=List[schemas.GameResponse])
def get_games(
    search: Optional[str] = None,
    sort_by: Optional[str] = Query(None, pattern="^(name|min_playtime|max_playtime|min_players|max_players|difficulty|user_rating|date_added|last_played)$"),
    sort_dir: Optional[str] = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
):
    query = db.query(models.Game)

    if search:
        query = query.filter(models.Game.name.ilike(f"%{search}%"))

    sort_column = getattr(models.Game, sort_by, models.Game.name) if sort_by else models.Game.name
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
def create_game(game: schemas.GameCreate, db: Session = Depends(get_db)):
    if game.bgg_id:
        existing = db.query(models.Game).filter(models.Game.bgg_id == game.bgg_id).first()
        if existing:
            raise HTTPException(status_code=409, detail="Game already in collection")

    db_game = models.Game(**game.model_dump())
    db.add(db_game)
    db.commit()
    db.refresh(db_game)
    logger.info("Game added: id=%d name=%r bgg_id=%s", db_game.id, db_game.name, db_game.bgg_id)
    return db_game


@router.patch("/{game_id}", response_model=schemas.GameResponse)
def update_game(game_id: int, game: schemas.GameUpdate, db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game:
        raise HTTPException(status_code=404, detail="Game not found")

    update_data = game.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_game, field, value)

    db.commit()
    db.refresh(db_game)
    return db_game


@router.delete("/{game_id}", status_code=204)
def delete_game(game_id: int, db: Session = Depends(get_db)):
    db_game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not db_game:
        raise HTTPException(status_code=404, detail="Game not found")

    logger.info("Game deleted: id=%d name=%r", db_game.id, db_game.name)
    db.delete(db_game)
    db.commit()
