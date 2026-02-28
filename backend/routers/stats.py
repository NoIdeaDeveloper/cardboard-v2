import json
import logging
from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas

logger = logging.getLogger("cardboard.stats")
router = APIRouter(prefix="/api", tags=["stats"])


@router.get("/stats", response_model=schemas.StatsResponse)
def get_stats(db: Session = Depends(get_db)):
    # ── Game counts ──────────────────────────────────────────────────────────
    status_rows = (
        db.query(models.Game.status, func.count(models.Game.id))
        .group_by(models.Game.status)
        .all()
    )
    by_status: dict = {"owned": 0, "wishlist": 0, "sold": 0}
    for status, count in status_rows:
        key = status or "owned"
        by_status[key] = count

    total_games = sum(by_status.values())

    # ── Session aggregates ───────────────────────────────────────────────────
    session_agg = db.query(
        func.count(models.PlaySession.id),
        func.coalesce(func.sum(models.PlaySession.duration_minutes), 0),
    ).first()
    total_sessions = session_agg[0] or 0
    total_minutes = int(session_agg[1] or 0)
    total_hours = round(total_minutes / 60, 1)
    avg_session_minutes = round(total_minutes / total_sessions, 1) if total_sessions else 0.0

    # ── Most played (top 5 by session count) ────────────────────────────────
    most_played_rows = (
        db.query(
            models.PlaySession.game_id,
            func.count(models.PlaySession.id).label("count"),
            func.coalesce(func.sum(models.PlaySession.duration_minutes), 0).label("total_minutes"),
        )
        .group_by(models.PlaySession.game_id)
        .order_by(func.count(models.PlaySession.id).desc())
        .limit(5)
        .all()
    )
    most_played = []
    for game_id, count, tot_min in most_played_rows:
        game = db.query(models.Game.name).filter(models.Game.id == game_id).first()
        if game:
            most_played.append(schemas.MostPlayedEntry(
                id=game_id, name=game[0], count=count, total_minutes=int(tot_min)
            ))

    # ── Never played ─────────────────────────────────────────────────────────
    played_ids = db.query(models.PlaySession.game_id).distinct().subquery()
    never_played_count = (
        db.query(func.count(models.Game.id))
        .filter(models.Game.id.not_in(played_ids))
        .scalar() or 0
    )

    # ── Average rating ───────────────────────────────────────────────────────
    avg_rating_raw = (
        db.query(func.avg(models.Game.user_rating))
        .filter(models.Game.user_rating.isnot(None))
        .scalar()
    )
    avg_rating = round(float(avg_rating_raw), 1) if avg_rating_raw is not None else None

    # ── Total spent ──────────────────────────────────────────────────────────
    total_spent_raw = (
        db.query(func.sum(models.Game.purchase_price))
        .filter(models.Game.purchase_price.isnot(None))
        .scalar()
    )
    total_spent = round(float(total_spent_raw), 2) if total_spent_raw is not None else None

    # ── Label counts (Python-side JSON parsing) ───────────────────────────────
    label_counts: dict = defaultdict(int)
    games_with_labels = (
        db.query(models.Game.labels).filter(models.Game.labels.isnot(None)).all()
    )
    for (labels_json,) in games_with_labels:
        try:
            for label in json.loads(labels_json):
                if label:
                    label_counts[label] += 1
        except (json.JSONDecodeError, TypeError):
            pass

    # ── Rating distribution ───────────────────────────────────────────────────
    rated_games = (
        db.query(models.Game.user_rating).filter(models.Game.user_rating.isnot(None)).all()
    )
    buckets = {"1–2": 0, "3–4": 0, "5–6": 0, "7–8": 0, "9–10": 0}
    for (r,) in rated_games:
        if r <= 2:   buckets["1–2"]  += 1
        elif r <= 4: buckets["3–4"]  += 1
        elif r <= 6: buckets["5–6"]  += 1
        elif r <= 8: buckets["7–8"]  += 1
        else:        buckets["9–10"] += 1

    # ── Build 12-month skeleton (reused for games and sessions) ──────────────
    today = date.today()
    month_keys: list = []
    for i in range(11, -1, -1):
        year = today.year
        month = today.month - i
        while month <= 0:
            month += 12
            year -= 1
        month_keys.append(date(year, month, 1).strftime("%b %Y"))

    # ── Added by month ────────────────────────────────────────────────────────
    month_counts: dict = {k: 0 for k in month_keys}
    for (dt,) in db.query(models.Game.date_added).all():
        if dt:
            key = dt.strftime("%b %Y")
            if key in month_counts:
                month_counts[key] += 1

    added_by_month = [
        schemas.AddedByMonthEntry(month=m, count=c)
        for m, c in month_counts.items()
    ]

    # ── Sessions by month ─────────────────────────────────────────────────────
    session_month_counts: dict = {k: 0 for k in month_keys}
    for (dt,) in db.query(models.PlaySession.played_at).all():
        if dt:
            key = dt.strftime("%b %Y")
            if key in session_month_counts:
                session_month_counts[key] += 1

    sessions_by_month = [
        schemas.AddedByMonthEntry(month=m, count=c)
        for m, c in session_month_counts.items()
    ]

    # ── Recent sessions (last 10) ─────────────────────────────────────────────
    recent_rows = (
        db.query(models.PlaySession, models.Game.name)
        .join(models.Game, models.PlaySession.game_id == models.Game.id)
        .order_by(models.PlaySession.played_at.desc(), models.PlaySession.date_added.desc())
        .limit(10)
        .all()
    )
    recent_sessions = [
        schemas.RecentSessionEntry(
            game_id=s.game_id,
            game_name=name,
            played_at=s.played_at,
            player_count=s.player_count,
            duration_minutes=s.duration_minutes,
        )
        for s, name in recent_rows
    ]

    logger.info("Stats computed: %d games, %d sessions", total_games, total_sessions)

    return schemas.StatsResponse(
        total_games=total_games,
        by_status=by_status,
        total_sessions=total_sessions,
        total_hours=total_hours,
        avg_session_minutes=avg_session_minutes,
        most_played=most_played,
        never_played_count=never_played_count,
        avg_rating=avg_rating,
        total_spent=total_spent,
        label_counts=dict(sorted(label_counts.items(), key=lambda x: -x[1])),
        ratings_distribution=buckets,
        added_by_month=added_by_month,
        sessions_by_month=sessions_by_month,
        recent_sessions=recent_sessions,
    )
