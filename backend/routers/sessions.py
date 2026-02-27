import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas

logger = logging.getLogger("cardboard.sessions")
router = APIRouter(tags=["sessions"])


def _sync_last_played(game_id: int, db: Session) -> None:
    """Recalculate and update game.last_played from remaining sessions."""
    latest = (
        db.query(models.PlaySession.played_at)
        .filter(models.PlaySession.game_id == game_id)
        .order_by(desc(models.PlaySession.played_at))
        .first()
    )
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if game:
        game.last_played = latest[0] if latest else None
        db.commit()


@router.get("/api/games/{game_id}/sessions", response_model=List[schemas.PlaySessionResponse])
def get_sessions(game_id: int, db: Session = Depends(get_db)):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    return (
        db.query(models.PlaySession)
        .filter(models.PlaySession.game_id == game_id)
        .order_by(desc(models.PlaySession.played_at))
        .all()
    )


@router.post("/api/games/{game_id}/sessions", response_model=schemas.PlaySessionResponse, status_code=201)
def add_session(game_id: int, session: schemas.PlaySessionCreate, db: Session = Depends(get_db)):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    db_session = models.PlaySession(game_id=game_id, **session.model_dump())
    db.add(db_session)
    db.commit()
    db.refresh(db_session)

    _sync_last_played(game_id, db)
    logger.info("Session logged: game_id=%d played_at=%s", game_id, session.played_at)
    return db_session


@router.delete("/api/sessions/{session_id}", status_code=204)
def delete_session(session_id: int, db: Session = Depends(get_db)):
    db_session = db.query(models.PlaySession).filter(models.PlaySession.id == session_id).first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    game_id = db_session.game_id
    db.delete(db_session)
    db.commit()

    _sync_last_played(game_id, db)
    logger.info("Session deleted: id=%d game_id=%d", session_id, game_id)
