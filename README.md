# Cardboard

A self-hosted board game collection manager. Search for any game on BoardGameGeek and it's added to your collection automatically — cover art, player count, playtime, difficulty and all. You can then rate games, track when you last played them, and add personal notes.

---

## What you need

- An Unraid server with Docker enabled
- The **Compose Manager** plugin (install it from the Community Apps store if you don't have it)
- Git installed on your Unraid server (available from Community Apps)

---

## Installation on Unraid

### Step 1 — Pull the code

Open an Unraid terminal and run:

```bash
cd /mnt/user/appdata
git clone https://github.com/your-username/cardboard-v2.git cardboard
```

This downloads the code to `/mnt/user/appdata/cardboard`.

### Step 2 — Create your settings file

```bash
cd /mnt/user/appdata/cardboard
cp .env.example .env
```

The defaults in `.env` work out of the box. You only need to change `PORT` if 8000 is already in use on your server.

### Step 3 — Start the container

In the Unraid UI, go to **Docker → Compose Manager**, click **Add New Stack**, give it the name `cardboard`, and set the path to `/mnt/user/appdata/cardboard`.

Then click **Up** (or run from terminal):

```bash
docker compose up -d
```

Cardboard will be available at **`http://your-unraid-ip:8000`**.

That's it. Your data is stored in `/mnt/user/appdata/cardboard/data/` and will survive container restarts, updates, and even a full Docker reset.

---

## Daily use

| Task | Command |
|---|---|
| Start | `docker compose up -d` |
| Stop | `docker compose down` |
| View logs | `docker logs cardboard` |
| Follow logs live | `docker logs -f cardboard` |

---

## Updating to a new version

```bash
cd /mnt/user/appdata/cardboard
git pull
docker compose up -d --build
```

This pulls the latest code and rebuilds the container. Your data is untouched.

---

## Backing up your data

Your entire collection lives in a single file:

```
/mnt/user/appdata/cardboard/data/cardboard.db
```

Copy that file somewhere safe to back up. Copy it back to restore.

---

## Changing the port

Edit the `.env` file:

```
PORT=9090
```

Then restart:

```bash
docker compose down
docker compose up -d
```

---

## Troubleshooting

**The page won't load**
Check if the container is running: `docker ps | grep cardboard`
Check the logs for errors: `docker logs cardboard`

**A game won't import from BGG**
BoardGameGeek occasionally queues new game data for processing and returns a temporary error. Wait 30 seconds and try again.

**I accidentally ran `docker compose down -v`**
The `-v` flag deletes Docker volumes. If you followed the installation above, your database is a bind-mounted file at `/mnt/user/appdata/cardboard/data/cardboard.db` — it is **not** a Docker volume, so it is safe even with `-v`.

---

## Code overview (for maintainers)

The project is a single Docker container running a Python backend that also serves the frontend.

```
cardboard/
├── Dockerfile             # How the container is built
├── docker-compose.yml     # How the container is run
├── .env                   # Your local settings (port, data path)
│
├── backend/               # Python / FastAPI
│   ├── main.py            # App startup, logging, static file serving
│   ├── database.py        # SQLite connection
│   ├── models.py          # Database table definition
│   ├── schemas.py         # Data validation (what the API accepts/returns)
│   ├── requirements.txt   # Python dependencies
│   └── routers/
│       ├── games.py       # /api/games — add, edit, delete, list games
│       └── bgg.py         # /api/bgg  — search BoardGameGeek
│
└── frontend/              # Plain HTML, CSS, JavaScript (no build step)
    ├── index.html
    ├── css/style.css
    └── js/
        ├── api.js         # Talks to the backend API
        ├── ui.js          # Builds cards, modals, toasts
        └── app.js         # Page logic and state
```

**To change something in the UI** — edit files in `frontend/`. Refresh the browser. No build step needed.

**To change something in the API** — edit files in `backend/`. Restart the container: `docker compose restart`.

**To add a Python dependency** — add it to `backend/requirements.txt`, then rebuild: `docker compose up -d --build`.

**API documentation** is auto-generated and available at `http://your-unraid-ip:8000/api/docs` while the container is running.
