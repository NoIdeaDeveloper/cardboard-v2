from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict
from datetime import date, datetime


class GameBase(BaseModel):
    name: str = Field(..., max_length=255)

    @field_validator('name', mode='before')
    @classmethod
    def strip_name(cls, v):
        return v.strip() if isinstance(v, str) else v

    status: str = Field('owned', pattern='^(owned|wishlist|sold)$')
    year_published: Optional[int] = None
    min_players: Optional[int] = Field(None, ge=1)
    max_players: Optional[int] = Field(None, ge=1)
    min_playtime: Optional[int] = Field(None, ge=1)
    max_playtime: Optional[int] = Field(None, ge=1)
    difficulty: Optional[float] = Field(None, ge=1, le=5)
    description: Optional[str] = Field(None, max_length=5000)
    image_url: Optional[str] = Field(None, max_length=2000)
    thumbnail_url: Optional[str] = Field(None, max_length=2000)
    instructions_filename: Optional[str] = Field(None, max_length=255)
    scan_filename: Optional[str] = Field(None, max_length=255)
    scan_glb_filename: Optional[str] = Field(None, max_length=255)
    scan_featured: bool = False
    categories: Optional[str] = Field(None, max_length=2000)
    mechanics: Optional[str] = Field(None, max_length=2000)
    designers: Optional[str] = Field(None, max_length=2000)
    publishers: Optional[str] = Field(None, max_length=2000)
    labels: Optional[str] = Field(None, max_length=2000)
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = None
    purchase_location: Optional[str] = Field(None, max_length=255)
    location: Optional[str] = Field(None, max_length=255)
    show_location: bool = False
    user_rating: Optional[float] = Field(None, ge=1, le=10)
    user_notes: Optional[str] = Field(None, max_length=2000)
    last_played: Optional[date] = None


class GameCreate(GameBase):
    pass


class GameUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)

    @field_validator('name', mode='before')
    @classmethod
    def strip_name(cls, v):
        return v.strip() if isinstance(v, str) else v

    status: Optional[str] = Field(None, pattern='^(owned|wishlist|sold)$')
    year_published: Optional[int] = None
    min_players: Optional[int] = Field(None, ge=1)
    max_players: Optional[int] = Field(None, ge=1)
    min_playtime: Optional[int] = Field(None, ge=1)
    max_playtime: Optional[int] = Field(None, ge=1)
    difficulty: Optional[float] = Field(None, ge=1, le=5)
    description: Optional[str] = Field(None, max_length=5000)
    image_url: Optional[str] = Field(None, max_length=2000)
    thumbnail_url: Optional[str] = Field(None, max_length=2000)
    categories: Optional[str] = Field(None, max_length=2000)
    mechanics: Optional[str] = Field(None, max_length=2000)
    designers: Optional[str] = Field(None, max_length=2000)
    publishers: Optional[str] = Field(None, max_length=2000)
    labels: Optional[str] = Field(None, max_length=2000)
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = None
    purchase_location: Optional[str] = Field(None, max_length=255)
    location: Optional[str] = Field(None, max_length=255)
    show_location: Optional[bool] = None
    user_rating: Optional[float] = Field(None, ge=1, le=10)
    user_notes: Optional[str] = Field(None, max_length=2000)
    last_played: Optional[date] = None
    scan_glb_filename: Optional[str] = Field(None, max_length=255)
    scan_featured: Optional[bool] = None


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
    caption: Optional[str] = None
    date_added: Optional[datetime] = None

    class Config:
        from_attributes = True


class GameImageUpdate(BaseModel):
    caption: Optional[str] = Field(None, max_length=500)


class ReorderImagesBody(BaseModel):
    order: List[int]


class GalleryImageFromUrl(BaseModel):
    url: str = Field(..., max_length=2000)


class PlaySessionCreate(BaseModel):
    played_at: date
    player_count: Optional[int] = Field(None, ge=1)
    duration_minutes: Optional[int] = Field(None, ge=1)
    notes: Optional[str] = Field(None, max_length=2000)


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


class SessionsByMonthEntry(BaseModel):
    month: str
    count: int
    game_ids: List[int] = []


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
    sessions_by_month: List[SessionsByMonthEntry]
    recent_sessions: List[RecentSessionEntry]
