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
        game.last_played = latest.played_at if latest else None
        db.commit()


def _get_session_players(session_id: int, db: Session) -> List[str]:
    """Return player names linked to a session."""
    rows = (
        db.query(models.Player.name)
        .join(models.SessionPlayer, models.Player.id == models.SessionPlayer.player_id)
        .filter(models.SessionPlayer.session_id == session_id)
        .all()
    )
    return [r.name for r in rows]


def _attach_players(session: models.PlaySession, db: Session) -> schemas.PlaySessionResponse:
    """Build PlaySessionResponse with player names populated."""
    resp = schemas.PlaySessionResponse.model_validate(session)
    resp.players = _get_session_players(session.id, db)
    return resp


def _link_players(session_id: int, player_names: List[str], db: Session) -> None:
    """Create players if needed and link them to a session."""
    # Clear existing links
    db.query(models.SessionPlayer).filter(models.SessionPlayer.session_id == session_id).delete()
    for name in player_names:
        name = name.strip()
        if not name:
            continue
        player = db.query(models.Player).filter(models.Player.name == name).first()
        if not player:
            player = models.Player(name=name)
            db.add(player)
            db.flush()
        db.add(models.SessionPlayer(session_id=session_id, player_id=player.id))
    db.flush()


@router.get("/api/games/{game_id}/sessions", response_model=List[schemas.PlaySessionResponse])
def get_sessions(game_id: int, db: Session = Depends(get_db)):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    sessions = (
        db.query(models.PlaySession)
        .filter(models.PlaySession.game_id == game_id)
        .order_by(desc(models.PlaySession.played_at))
        .all()
    )
    return [_attach_players(s, db) for s in sessions]


@router.post("/api/games/{game_id}/sessions", response_model=schemas.PlaySessionResponse, status_code=201)
def add_session(game_id: int, session: schemas.PlaySessionCreate, db: Session = Depends(get_db)):
    game = db.query(models.Game).filter(models.Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    data = session.model_dump(exclude={"player_names"})
    db_session = models.PlaySession(game_id=game_id, **data)
    db.add(db_session)
    db.flush()

    if session.player_names:
        _link_players(db_session.id, session.player_names, db)

    db.commit()
    db.refresh(db_session)

    _sync_last_played(game_id, db)
    logger.info("Session logged: game_id=%d played_at=%s", game_id, session.played_at)
    return _attach_players(db_session, db)


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
