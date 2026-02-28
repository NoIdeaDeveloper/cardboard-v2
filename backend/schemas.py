from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import date, datetime


class GameBase(BaseModel):
    name: str
    status: str = Field('owned', pattern='^(owned|wishlist|sold)$')
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
    scan_filename: Optional[str] = None
    categories: Optional[str] = None
    mechanics: Optional[str] = None
    designers: Optional[str] = None
    publishers: Optional[str] = None
    labels: Optional[str] = None
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = None
    purchase_location: Optional[str] = None
    user_rating: Optional[float] = Field(None, ge=1, le=10)
    user_notes: Optional[str] = None
    last_played: Optional[date] = None


class GameCreate(GameBase):
    pass


class GameUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = Field(None, pattern='^(owned|wishlist|sold)$')
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
    labels: Optional[str] = None
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = None
    purchase_location: Optional[str] = None
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


class GameImageResponse(BaseModel):
    id: int
    game_id: int
    filename: str
    sort_order: int
    date_added: Optional[datetime] = None

    class Config:
        from_attributes = True


class ReorderImagesBody(BaseModel):
    order: List[int]


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


class MostPlayedEntry(BaseModel):
    id: int
    name: str
    count: int
    total_minutes: int


class AddedByMonthEntry(BaseModel):
    month: str
    count: int


class RecentSessionEntry(BaseModel):
    game_id: int
    game_name: str
    played_at: date
    player_count: Optional[int] = None
    duration_minutes: Optional[int] = None


class StatsResponse(BaseModel):
    total_games: int
    by_status: Dict[str, int]
    total_sessions: int
    total_hours: float
    avg_session_minutes: float
    most_played: List[MostPlayedEntry]
    never_played_count: int
    avg_rating: Optional[float]
    total_spent: Optional[float]
    label_counts: Dict[str, int]
    ratings_distribution: Dict[str, int]
    added_by_month: List[AddedByMonthEntry]
    sessions_by_month: List[AddedByMonthEntry]
    recent_sessions: List[RecentSessionEntry]
