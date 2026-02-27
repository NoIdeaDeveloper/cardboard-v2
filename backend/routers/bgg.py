import asyncio
import json
import logging
import re
import xml.etree.ElementTree as ET
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

from schemas import BGGSearchResult, GameCreate

logger = logging.getLogger("cardboard.bgg")
router = APIRouter(prefix="/api/bgg", tags=["bgg"])

BGG_API_BASE = "https://www.boardgamegeek.com/xmlapi2"
HEADERS = {"User-Agent": "Cardboard/1.0 (board game collection manager)"}
BGG_RETRY_ATTEMPTS = 4   # BGG returns 202 when a game is queued; retry up to this many times
BGG_RETRY_DELAY = 2.0    # seconds to wait between retries


def _fix_url(url: Optional[str]) -> Optional[str]:
    """Prepend https: to protocol-relative URLs returned by BGG (e.g. //cdn.example.com/...)."""
    if url and url.startswith("//"):
        return "https:" + url
    return url


def clean_description(text: str) -> str:
    """Strip HTML entities and tags from BGG descriptions."""
    text = re.sub(r'&#10;', '\n', text)
    text = re.sub(r'&mdash;', '\u2014', text)
    text = re.sub(r'&ndash;', '\u2013', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&quot;', '"', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'<[^>]+>', '', text)
    return text.strip()


@router.get("/search", response_model=List[BGGSearchResult])
async def search_bgg(q: str = Query(..., min_length=2)):
    """Search BoardGameGeek for games by name."""
    logger.info("BGG search query: %r", q)
    async with httpx.AsyncClient(headers=HEADERS, timeout=15.0) as client:
        try:
            resp = await client.get(
                f"{BGG_API_BASE}/search",
                params={"query": q, "type": "boardgame,boardgameexpansion"},
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.error("BGG search HTTP error: %s", exc)
            raise HTTPException(status_code=502, detail=f"BGG API error: {exc}")

    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError as exc:
        logger.error("BGG search XML parse error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to parse BGG response")

    results: List[BGGSearchResult] = []
    for item in root.findall("item"):
        bgg_id = int(item.get("id", 0))
        name_el = item.find("name")
        name = name_el.get("value", "") if name_el is not None else ""
        year_el = item.find("yearpublished")
        year = int(year_el.get("value", 0)) if year_el is not None and year_el.get("value") else None

        if bgg_id and name:
            results.append(BGGSearchResult(bgg_id=bgg_id, name=name, year_published=year))

    results.sort(key=lambda x: (x.year_published is None, -(x.year_published or 0)))
    logger.info("BGG search %r returned %d results", q, len(results))
    return results[:30]


@router.get("/game/{bgg_id}", response_model=GameCreate)
async def get_bgg_game(bgg_id: int):
    """Fetch full game details from BGG by ID, with retry on HTTP 202 (queued)."""
    logger.info("BGG game fetch: bgg_id=%d", bgg_id)

    resp = None
    async with httpx.AsyncClient(headers=HEADERS, timeout=20.0) as client:
        for attempt in range(1, BGG_RETRY_ATTEMPTS + 1):
            try:
                resp = await client.get(
                    f"{BGG_API_BASE}/thing",
                    params={"id": bgg_id, "stats": 1},
                )
            except httpx.HTTPError as exc:
                logger.error("BGG game fetch HTTP error (attempt %d): %s", attempt, exc)
                raise HTTPException(status_code=502, detail=f"BGG API error: {exc}")

            if resp.status_code == 202:
                # BGG has queued this item for processing — wait and retry
                logger.warning(
                    "BGG returned 202 for bgg_id=%d (attempt %d/%d), retrying in %.1fs…",
                    bgg_id, attempt, BGG_RETRY_ATTEMPTS, BGG_RETRY_DELAY,
                )
                if attempt < BGG_RETRY_ATTEMPTS:
                    await asyncio.sleep(BGG_RETRY_DELAY)
                    continue
                raise HTTPException(
                    status_code=503,
                    detail="BGG is still processing this game. Please try again in a few seconds.",
                )

            # Any non-2xx status (other than 202 handled above)
            if resp.status_code >= 400:
                logger.error("BGG game fetch failed: status=%d bgg_id=%d", resp.status_code, bgg_id)
                resp.raise_for_status()

            break  # success

    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError as exc:
        logger.error("BGG game XML parse error for bgg_id=%d: %s", bgg_id, exc)
        raise HTTPException(status_code=502, detail="Failed to parse BGG response")

    item = root.find("item")
    if item is None:
        raise HTTPException(status_code=404, detail="Game not found on BGG")

    def get_val(tag: str, attr: str = "value") -> Optional[str]:
        el = item.find(tag)
        return el.get(attr) if el is not None else None

    # Primary name (fall back to first name element)
    name = ""
    for name_el in item.findall("name"):
        if name_el.get("type") == "primary":
            name = name_el.get("value", "")
            break
    if not name:
        first = item.find("name")
        name = first.get("value", "Unknown") if first is not None else "Unknown"

    # Linked lists
    categories = [
        el.get("value") for el in item.findall("link")
        if el.get("type") == "boardgamecategory" and el.get("value")
    ]
    mechanics = [
        el.get("value") for el in item.findall("link")
        if el.get("type") == "boardgamemechanic" and el.get("value")
    ]
    designers = [
        el.get("value") for el in item.findall("link")
        if el.get("type") == "boardgamedesigner" and el.get("value")
    ]
    publishers = [
        el.get("value") for el in item.findall("link")
        if el.get("type") == "boardgamepublisher" and el.get("value")
    ]

    # Weight / difficulty from stats
    difficulty = None
    stats = item.find("statistics/ratings")
    if stats is not None:
        weight_el = stats.find("averageweight")
        if weight_el is not None:
            try:
                w = round(float(weight_el.get("value", 0)), 2)
                difficulty = w if w > 0.0 else None
            except ValueError:
                pass

    # Description
    desc_el = item.find("description")
    description = clean_description(desc_el.text or "") if desc_el is not None else None
    if not description:
        description = None

    def safe_int(val: Optional[str]) -> Optional[int]:
        try:
            return int(val) if val else None
        except (ValueError, TypeError):
            return None

    try:
        year = int(get_val("yearpublished") or 0) or None
    except (ValueError, TypeError):
        year = None

    game = GameCreate(
        bgg_id=bgg_id,
        name=name,
        year_published=year,
        min_players=safe_int(get_val("minplayers")),
        max_players=safe_int(get_val("maxplayers")),
        min_playtime=safe_int(get_val("minplaytime")),
        max_playtime=safe_int(get_val("maxplaytime")),
        difficulty=difficulty,
        description=description,
        image_url=_fix_url(get_val("image")),
        thumbnail_url=_fix_url(get_val("thumbnail")),
        categories=json.dumps(categories) if categories else None,
        mechanics=json.dumps(mechanics) if mechanics else None,
        designers=json.dumps(designers) if designers else None,
        publishers=json.dumps(publishers) if publishers else None,
    )
    logger.info("BGG game fetched: bgg_id=%d name=%r", bgg_id, game.name)
    return game
