import logging
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import case, func
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
        by_status[key] = by_status.get(key, 0) + count

    total_games = sum(by_status.values())

    # ── Session aggregates ───────────────────────────────────────────────────
    session_agg = db.query(
        func.count(models.PlaySession.id),
        func.coalesce(func.sum(models.PlaySession.duration_minutes), 0),
    ).first()
    total_sessions = session_agg[0] or 0
    total_minutes = int(session_agg[1])
    total_hours = round(total_minutes / 60, 1)
    avg_session_minutes = round(total_minutes / total_sessions, 1) if total_sessions else 0.0

    # ── Most played (top 5 by session count) ────────────────────────────────
    most_played_rows = (
        db.query(
            models.Game.id,
            models.Game.name,
            func.count(models.PlaySession.id).label("count"),
            func.coalesce(func.sum(models.PlaySession.duration_minutes), 0).label("total_minutes"),
        )
        .join(models.Game, models.PlaySession.game_id == models.Game.id)
        .group_by(models.Game.id, models.Game.name)
        .order_by(func.count(models.PlaySession.id).desc())
        .limit(5)
        .all()
    )
    most_played = [
        schemas.MostPlayedEntry(id=gid, name=name, count=count, total_minutes=int(tot_min))
        for gid, name, count, tot_min in most_played_rows
    ]

    # ── Never played ─────────────────────────────────────────────────────────
    played_ids = db.query(models.PlaySession.game_id).distinct()
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

    # ── Label counts (via junction tables) ──────────────────────────────────────
    label_rows = (
        db.query(models.Label.name, func.count(models.GameLabel.game_id))
        .join(models.GameLabel, models.Label.id == models.GameLabel.label_id)
        .group_by(models.Label.name)
        .all()
    )
    label_counts: dict = {name: count for name, count in label_rows}

    # ── Rating distribution ───────────────────────────────────────────────────
    r = models.Game.user_rating
    (b1, b2, b3, b4, b5) = db.query(
        func.count(case((r <= 2,  1))),
        func.count(case(((r >= 3) & (r <= 4),  1))),
        func.count(case(((r >= 5) & (r <= 6),  1))),
        func.count(case(((r >= 7) & (r <= 8),  1))),
        func.count(case((r >= 9,  1))),
    ).filter(r.isnot(None)).one()
    buckets = {"1–2": b1, "3–4": b2, "5–6": b3, "7–8": b4, "9–10": b5}

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
    session_month_game_ids: dict = {k: set() for k in month_keys}
    for (game_id, dt) in db.query(models.PlaySession.game_id, models.PlaySession.played_at).all():
        if dt:
            key = dt.strftime("%b %Y")
            if key in session_month_counts:
                session_month_counts[key] += 1
                session_month_game_ids[key].add(game_id)

    sessions_by_month = [
        schemas.SessionsByMonthEntry(month=m, count=c, game_ids=sorted(session_month_game_ids[m]))
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

    # ── Session counts per game ─────────────────────────────────────────────
    session_counts_rows = (
        db.query(models.PlaySession.game_id, func.count(models.PlaySession.id))
        .group_by(models.PlaySession.game_id)
        .all()
    )
    session_counts = {str(gid): count for gid, count in session_counts_rows}

    # ── Expansion count ──────────────────────────────────────────────────────
    total_expansions = (
        db.query(func.count(models.Game.id))
        .filter(models.Game.parent_game_id.isnot(None))
        .scalar() or 0
    )

    logger.info("Stats computed: %d games, %d sessions, %d expansions", total_games, total_sessions, total_expansions)

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
        session_counts=session_counts,
        total_expansions=total_expansions,
    )
