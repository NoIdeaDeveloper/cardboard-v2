import json
import logging
import os
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import text

from database import engine, Base
from routers import games, sessions, stats, game_images

# force=True ensures our format wins even if another library called basicConfig first.
# PYTHONUNBUFFERED=1 (set in Docker env) makes stdout unbuffered so logs appear immediately.
logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    force=True,
)
logger = logging.getLogger("cardboard")

# Ensure data directories exist
for subdir in ["", "images", "instructions", "scans", "gallery"]:
    path = os.path.join(os.getenv("DATA_DIR", "/app/data"), subdir)
    os.makedirs(path, exist_ok=True)
    if subdir:
        logger.info("Data sub-directory ready: %s", path)

logger.info("Data directory: %s", os.path.abspath(os.getenv("DATA_DIR", "/app/data")))

# Create DB tables on startup
Base.metadata.create_all(bind=engine)
logger.info("Database tables verified")

# Verify DB is actually reachable before serving traffic
try:
    with engine.connect() as _probe:
        _probe.execute(text("SELECT 1"))
    logger.info("Database connectivity verified")
except Exception as _exc:
    logger.error("Cannot connect to database at startup: %s", _exc)
    raise SystemExit(1)

# Migrate existing databases: add any columns that are missing from older schemas.
# SQLite supports ADD COLUMN but not DROP/MODIFY, so this is safe to run on every start.
_GAMES_MIGRATIONS = [
    # (column_name, sqlite_type_and_default)
    ("last_played",           "DATE"),
    ("image_cached",          "INTEGER NOT NULL DEFAULT 0"),
    ("instructions_filename", "TEXT"),
    ("status",                "TEXT NOT NULL DEFAULT 'owned'"),
    ("labels",                "TEXT"),
    ("purchase_date",         "DATE"),
    ("purchase_price",        "REAL"),
    ("purchase_location",     "VARCHAR(255)"),
    ("scan_filename",         "TEXT"),
    ("scan_glb_filename",     "VARCHAR(255)"),
    ("scan_featured",         "INTEGER NOT NULL DEFAULT 0"),
    ("location",              "VARCHAR(255)"),
    ("show_location",         "INTEGER NOT NULL DEFAULT 0"),
    ("parent_game_id",        "INTEGER"),
]

# NOTE: _col and _typedef are hardcoded above — never from user input.
with engine.connect() as _conn:
    _existing = {row[1] for row in _conn.execute(text("PRAGMA table_info(games)"))}
    for _col, _typedef in _GAMES_MIGRATIONS:
        if _col not in _existing:
            _conn.execute(text(f"ALTER TABLE games ADD COLUMN {_col} {_typedef}"))
            _conn.commit()
            logger.info("Migration applied: games.%s added", _col)

_GAME_IMAGES_MIGRATIONS = [
    ("caption", "VARCHAR(500)"),
]

with engine.connect() as _conn:
    _existing_img = {row[1] for row in _conn.execute(text("PRAGMA table_info(game_images)"))}
    for _col, _typedef in _GAME_IMAGES_MIGRATIONS:
        if _col not in _existing_img:
            _conn.execute(text(f"ALTER TABLE game_images ADD COLUMN {_col} {_typedef}"))
            _conn.commit()
            logger.info("Migration applied: game_images.%s added", _col)

# ── Migrate JSON tag columns → junction tables (one-time, idempotent) ─────────
_TAG_CONFIG = [
    # (game_column, tag_table, pivot_table, fk_column)
    ("categories", "categories", "game_categories", "category_id"),
    ("mechanics",  "mechanics",  "game_mechanics",  "mechanic_id"),
    ("designers",  "designers",  "game_designers",  "designer_id"),
    ("publishers", "publishers", "game_publishers", "publisher_id"),
    ("labels",     "labels",     "game_labels",     "label_id"),
]


def _migrate_json_tags_to_junction():
    """Parse existing JSON TEXT columns into the new junction tables.

    Safe to call on every startup:
    - Skips entirely if pivot tables already have data
    - Uses INSERT OR IGNORE so duplicates are impossible
    - Commits per tag type so partial progress is preserved on crash
    - Malformed JSON is logged and skipped, never crashes
    """
    with engine.connect() as conn:
        for game_col, tag_table, pivot_table, fk_col in _TAG_CONFIG:
            # Per-tag-type idempotency: skip if this pivot table already has data
            try:
                count = conn.execute(text(f"SELECT COUNT(*) FROM {pivot_table}")).scalar()
                if count and count > 0:
                    logger.info("Junction migration [%s] already complete (%d rows), skipping", game_col, count)
                    continue
            except Exception:
                logger.warning("Table %s not found, skipping migration for %s", pivot_table, game_col)
                continue
            rows = conn.execute(
                text(f"SELECT id, {game_col} FROM games WHERE {game_col} IS NOT NULL")
            ).fetchall()

            migrated = 0
            skipped = 0
            for game_id, json_str in rows:
                try:
                    items = json.loads(json_str)
                    if not isinstance(items, list):
                        skipped += 1
                        continue
                except (json.JSONDecodeError, TypeError):
                    logger.warning("Skipping malformed %s JSON for game %d: %.80s", game_col, game_id, str(json_str))
                    skipped += 1
                    continue

                for item in items:
                    name = (str(item) if item else "").strip()
                    if not name:
                        continue
                    # Get or create tag
                    existing = conn.execute(
                        text(f"SELECT id FROM {tag_table} WHERE name = :n"), {"n": name}
                    ).first()
                    if existing:
                        tag_id = existing[0]
                    else:
                        conn.execute(text(f"INSERT INTO {tag_table} (name) VALUES (:n)"), {"n": name})
                        tag_id = conn.execute(
                            text(f"SELECT id FROM {tag_table} WHERE name = :n"), {"n": name}
                        ).first()[0]
                    # Link game ↔ tag (ignore if already exists)
                    conn.execute(
                        text(f"INSERT OR IGNORE INTO {pivot_table} (game_id, {fk_col}) VALUES (:gid, :tid)"),
                        {"gid": game_id, "tid": tag_id},
                    )
                    migrated += 1

            conn.commit()
            if migrated or skipped:
                logger.info("Junction migration [%s]: %d links created from %d games (%d skipped)",
                            game_col, migrated, len(rows), skipped)

    logger.info("Junction table migration complete")


_migrate_json_tags_to_junction()

app = FastAPI(title="Cardboard API", version="1.0.0", docs_url="/api/docs")


@app.get("/health", include_in_schema=False)
async def health_check():
    return {"status": "ok"}


@app.on_event("shutdown")
async def _shutdown():
    engine.dispose()
    logger.info("Cardboard shutting down — connections closed")

_raw_origins = os.getenv("ALLOWED_ORIGINS", "").split(",")
_ALLOWED_ORIGINS = [o.strip() for o in _raw_origins if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log every request with method, path, status code and response time."""
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    if request.url.path.startswith("/api/"):
        logger.info(
            "%s %s -> %d (%.1f ms)",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
    return response


app.include_router(games.router)
app.include_router(game_images.router)
app.include_router(sessions.router)
app.include_router(stats.router)

# Serve frontend static files
FRONTEND_PATH = os.getenv("FRONTEND_PATH", "/app/frontend")

if os.path.exists(FRONTEND_PATH):
    for static_dir in ["css", "js"]:
        dir_path = os.path.join(FRONTEND_PATH, static_dir)
        if os.path.exists(dir_path):
            app.mount(f"/{static_dir}", StaticFiles(directory=dir_path), name=static_dir)

    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(FRONTEND_PATH, "index.html"))

    @app.get("/{path:path}")
    async def serve_frontend(path: str):
        frontend_real = os.path.realpath(FRONTEND_PATH)
        file_path = os.path.realpath(os.path.join(FRONTEND_PATH, path))
        if file_path.startswith(frontend_real + os.sep) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_PATH, "index.html"))

    logger.info("Frontend serving from: %s", FRONTEND_PATH)
else:
    logger.warning("Frontend path not found: %s — only API will be served", FRONTEND_PATH)

logger.info("Cardboard application ready")
