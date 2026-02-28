import logging
import os
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import text

from database import engine, Base
from routers import games, sessions, stats

# force=True ensures our format wins even if another library called basicConfig first.
# PYTHONUNBUFFERED=1 (set in Docker env) makes stdout unbuffered so logs appear immediately.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    force=True,
)
logger = logging.getLogger("cardboard")

# Ensure data directories exist
for subdir in ["", "images", "instructions", "scans"]:
    path = os.path.join(os.getenv("DATA_DIR", "/app/data"), subdir)
    os.makedirs(path, exist_ok=True)
    if subdir:
        logger.info("Data sub-directory ready: %s", path)

logger.info("Data directory: %s", os.path.abspath(os.getenv("DATA_DIR", "/app/data")))

# Create DB tables on startup
Base.metadata.create_all(bind=engine)
logger.info("Database tables verified")

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
]

with engine.connect() as _conn:
    _existing = {row[1] for row in _conn.execute(text("PRAGMA table_info(games)"))}
    for _col, _typedef in _GAMES_MIGRATIONS:
        if _col not in _existing:
            _conn.execute(text(f"ALTER TABLE games ADD COLUMN {_col} {_typedef}"))
            _conn.commit()
            logger.info("Migration applied: games.%s added", _col)

app = FastAPI(title="Cardboard API", version="1.0.0", docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log every request with method, path, status code and response time."""
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s -> %d (%.1f ms)",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


app.include_router(games.router)
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
