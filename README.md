# Cardboard

A self-hosted board game collection manager. Search for any game on BoardGameGeek and it's added to your collection automatically — cover art, player count, playtime, difficulty and all. You can then rate games, track when you last played them, and add personal notes.

---

## Features

**Collection Management**
- Add games with full metadata: name, status, year published, player count, playtime, difficulty, description, categories, mechanics, designers, publishers, and custom labels
- Tag fields (categories, mechanics, designers, publishers, labels) autocomplete from existing values in your collection
- Grid and list view with real-time search, multi-field sort (name, date added, rating, playtime, players, difficulty, last played, purchase date/price), and sort direction toggle
- Status filter pills — All, Owned, Wishlist, Sold
- Cover image per game — local file upload or external URL (auto-cached locally)
- User rating (1–10 stars), personal notes, purchase details, and storage location
- **Bulk operations** — select multiple games via the toolbar checkbox mode, then change status or delete in one action
- **Import from BGG** — upload a BoardGameGeek XML collection export to bulk-import games (Settings panel → Import from BGG)

**Expansions**
- Link expansion games to a parent base game (one level deep)
- Expansion count badge on parent game cards; toggle to show/hide expansions in the collection
- Validation prevents chained or circular expansion links

**Photo Gallery**
- Multiple photos per game, uploaded from file or URL
- Reorder images, add captions, and feature any photo as the primary cover
- Full-screen lightbox viewer

**Instructions & Documents**
- Upload PDF or TXT instruction files per game
- PDFs viewable inline; all files downloadable from the game modal

**3D Scans**
- Upload USDZ (for AR on iOS/iPadOS) and GLB (for the in-browser 3D viewer) per game
- Toggle which format is featured on the card

**Play Session Tracking**
- Log play sessions with date, player count, duration, and notes
- Quick-log overlay for fast entry (keyboard shortcut available)
- Last played date auto-synced from session history

**Statistics Dashboard**
- Summary cards: total games by status, sessions, hours played, average session length, never-played count, average rating, total spent
- Rating distribution and label frequency charts
- Games added per month and sessions per month — 12-month bar charts, clickable to see which games
- Recent 10 play sessions list
- **Export** — download your full collection as JSON or CSV (Settings panel → Export), with a configurable field picker
- **Backup** — download a single ZIP containing the database and all media (Settings panel → Backup)

**Milestones**
- Automatic milestone detection on session count (5, 10, 25, 50, 100, 200) and hours (5, 10, 25, 50, 100)
- Toast notification with a confetti burst on major milestones

**Filters & Discovery**
- Advanced filter panel: never played, player count, playtime, mechanics, categories
- "Pick for Me" random game selector — respects active filters and excludes expansions

**UI / UX**
- Dark mode (default) and light mode — preference persisted across sessions
- Keyboard shortcuts with an in-app reference overlay
- Hash-based URL navigation (page refresh stays on the current view)
- Toast notifications for all actions
- Fully responsive — works on mobile, tablet, and desktop

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

The easiest way is to use the **in-app backup**: open the Stats view, click the settings icon, and hit **Download ZIP**. This creates a single archive containing the database and all media files (cover images, photo galleries, instruction PDFs).

For a manual backup, copy the data directory somewhere safe:

```
/mnt/user/appdata/cardboard/data/
```

To restore, stop the container, replace the `data/` directory with your backup, and start again.

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
│   ├── main.py            # App startup, DB migration, static file serving
│   ├── database.py        # SQLite connection (SQLAlchemy)
│   ├── models.py          # Game, GameImage, PlaySession, tag junction tables
│   ├── schemas.py         # Pydantic request/response validation
│   ├── utils.py           # Shared helpers (safe URL validation)
│   ├── requirements.txt   # Python dependencies
│   └── routers/
│       ├── games.py       # /api/games — CRUD, images, instructions, scans
│       ├── game_images.py # /api/games/{id}/images — gallery management
│       ├── sessions.py    # /api/games/{id}/sessions — play session tracking
│       └── stats.py       # /api/stats — collection statistics
│
├── frontend/              # Plain HTML, CSS, JavaScript (no build step)
│   ├── index.html
│   ├── css/style.css      # Dark/light themes, responsive layout
│   └── js/
│       ├── api.js         # Talks to the backend API
│       ├── ui.js          # Builds cards, modals, stats views, toasts
│       ├── app.js         # Page logic, state, navigation, event wiring
│       ├── confetti.js    # Confetti animation for play milestones
│       └── model-viewer.min.js  # 3D model viewer web component
│
└── data/                  # Persisted outside the container
    ├── cardboard.db       # SQLite database
    ├── images/            # Cached cover images
    ├── gallery/           # Per-game photo galleries
    ├── instructions/      # Uploaded PDF/TXT instruction files
    └── scans/             # 3D scan files (USDZ / GLB)
```

**To change something in the UI** — edit files in `frontend/`. Refresh the browser. No build step needed.

**To change something in the API** — edit files in `backend/`. Restart the container: `docker compose restart`.

**To add a Python dependency** — add it to `backend/requirements.txt`, then rebuild: `docker compose up -d --build`.

**API documentation** is auto-generated and available at `http://your-unraid-ip:8000/api/docs` while the container is running.
