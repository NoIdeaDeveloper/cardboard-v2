# Cardboard

A self-hosted board game and card game collection manager. Search BoardGameGeek to auto-populate game details, rate your games, track when you last played them, and add personal notes — all in a clean, responsive interface.

---

## Features

- **BGG Search** — find any game on BoardGameGeek and import it with one click (name, description, players, playtime, difficulty, cover art, categories, mechanics, designers)
- **Manual Entry** — add games that aren't on BGG
- **Collection View** — browse your games in grid or list layout
- **Sort & Search** — sort by name, rating, playtime, players, difficulty, last played, or date added; filter by name
- **Rating** — rate each game out of 10 with an interactive star widget
- **Last Played** — track when you last played each game with a date picker or "Today" shortcut
- **Notes** — add personal notes to any game
- **Edit** — update any detail for any game at any time
- **Persistent Data** — all data stored in a SQLite database that survives container restarts

---

## Requirements

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/your-username/cardboard-v2.git
cd cardboard-v2
```

### 2. Build and start

```bash
docker compose up -d
```

Cardboard will be available at **http://localhost:8000**.

### 3. Stop

```bash
docker compose down
```

Data is preserved in a Docker volume (`cardboard_data`) and will be available when you restart.

---

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `PORT` | `8000` | Host port to expose the application on |
| `DATA_PATH` | *(Docker named volume)* | Host path for database storage — set this on Unraid |
| `DATABASE_URL` | `sqlite:////app/data/cardboard.db` | Full database URL (do not change) |
| `FRONTEND_PATH` | `/app/frontend` | Internal path to frontend files (do not change) |

### Custom port

```bash
PORT=9090 docker compose up -d
```

---

## Data Persistence

Your game collection is stored in a SQLite database inside the container at `/app/data/cardboard.db`.

**The database is NOT deleted when you stop or restart the container.** It is only deleted if you explicitly run `docker compose down -v` (the `-v` flag removes volumes).

Docker maps that path to persistent storage in one of two ways:

### Option A — Docker named volume (default, any Docker host)

No configuration needed. Docker manages the storage location automatically. The named volume `cardboard_data` persists across all stops, starts, and `docker compose down` calls.

```bash
docker compose up -d          # start
docker compose down           # stop — data is safe
docker compose up -d          # restart — data is still there
docker compose down -v        # ⚠ this deletes the volume and all data
```

### Option B — Bind mount (recommended for Unraid)

On Unraid, Docker's named volumes are stored on the cache drive by default. If the cache drive fails, data is lost. Binding to a path on your array is safer.

Create a `.env` file next to `docker-compose.yml`:

```bash
DATA_PATH=/mnt/user/appdata/cardboard
```

Then start normally:

```bash
docker compose up -d
```

Docker will mount `/mnt/user/appdata/cardboard` as the data directory. This path lives on your protected array and survives Docker resets.

---

## Unraid Deployment (Compose Manager)

1. Install the **Compose Manager** plugin from the Unraid Community Apps store
2. Create a new compose stack and paste in the contents of `docker-compose.yml`
3. Create a `.env` file alongside it:
   ```
   DATA_PATH=/mnt/user/appdata/cardboard
   PORT=8000
   ```
4. Start the stack — Cardboard will be available at `http://your-unraid-ip:8000`

---

## Development (local, without Docker)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
FRONTEND_PATH=../frontend uvicorn main:app --reload --port 8000
```

The API docs are at http://localhost:8000/api/docs.

The frontend is served at http://localhost:8000.

---

## Project Structure

```
cardboard-v2/
├── Dockerfile                  # Single-container build
├── docker-compose.yml
├── .dockerignore
├── .gitignore
├── README.md
├── backend/
│   ├── main.py                 # FastAPI app entrypoint & static file serving
│   ├── database.py             # SQLAlchemy engine & session
│   ├── models.py               # ORM models
│   ├── schemas.py              # Pydantic schemas
│   ├── requirements.txt
│   └── routers/
│       ├── games.py            # CRUD endpoints for /api/games
│       └── bgg.py              # BGG proxy endpoints for /api/bgg
└── frontend/
    ├── index.html
    ├── css/
    │   └── style.css
    └── js/
        ├── api.js              # Fetch wrapper for the backend API
        ├── ui.js               # DOM building helpers, modal, toast
        └── app.js              # Main application logic
```

---

## API Reference

The full interactive API docs are available at `/api/docs` when the app is running.

| Method | Path | Description |
|---|---|---|
| GET | `/api/games/` | List all games (with optional `search`, `sort_by`, `sort_dir`) |
| GET | `/api/games/{id}` | Get a single game |
| POST | `/api/games/` | Add a game manually |
| PATCH | `/api/games/{id}` | Update a game |
| DELETE | `/api/games/{id}` | Remove a game |
| GET | `/api/bgg/search?q=` | Search BoardGameGeek |
| GET | `/api/bgg/game/{bgg_id}` | Fetch full BGG game details |

---

## Logs

Docker logs are written in JSON format and **automatically rotated** — they will not grow unboundedly.

| Setting | Value | Effect |
|---|---|---|
| `max-size` | `10m` | Each log file is capped at 10 MB |
| `max-file` | `3` | At most 3 rotated log files are kept |
| **Total max** | **30 MB** | Oldest logs are automatically discarded |

View logs with:

```bash
docker logs cardboard           # full log
docker logs -f cardboard        # follow (live tail)
docker logs --tail 100 cardboard  # last 100 lines
```

---

## License

MIT
