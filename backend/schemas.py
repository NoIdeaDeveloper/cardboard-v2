from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime


class GameBase(BaseModel):
    name: str
    year_published: Optional[int] = None
    min_players: Optional[int] = None
    max_players: Optional[int] = None
    min_playtime: Optional[int] = None
    max_playtime: Optional[int] = None
    difficulty: Optional[float] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    instructions_filename: Optional[str] = None
    categories: Optional[str] = None
    mechanics: Optional[str] = None
    designers: Optional[str] = None
    publishers: Optional[str] = None
    user_rating: Optional[float] = Field(None, ge=1, le=10)
    user_notes: Optional[str] = None
    last_played: Optional[date] = None


class GameCreate(GameBase):
    pass


class GameUpdate(BaseModel):
    name: Optional[str] = None
    year_published: Optional[int] = None
    min_players: Optional[int] = None
    max_players: Optional[int] = None
    min_playtime: Optional[int] = None
    max_playtime: Optional[int] = None
    difficulty: Optional[float] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    categories: Optional[str] = None
    mechanics: Optional[str] = None
    designers: Optional[str] = None
    publishers: Optional[str] = None
    user_rating: Optional[float] = Field(None, ge=1, le=10)
    user_notes: Optional[str] = None
    last_played: Optional[date] = None


class GameResponse(GameBase):
    id: int
    image_cached: bool = False
    date_added: Optional[datetime] = None
    date_modified: Optional[datetime] = None

    class Config:
        from_attributes = True


class PlaySessionCreate(BaseModel):
    played_at: date
    player_count: Optional[int] = None
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None


class PlaySessionResponse(PlaySessionCreate):
    id: int
    game_id: int
    date_added: Optional[datetime] = None

    class Config:
        from_attributes = True
