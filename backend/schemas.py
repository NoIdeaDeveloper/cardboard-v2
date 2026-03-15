from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List, Dict
from datetime import date, datetime


def _strip_name(v):
    return v.strip() if isinstance(v, str) else v


def _validate_min_max(model):
    if model.min_players and model.max_players and model.min_players > model.max_players:
        raise ValueError('min_players cannot exceed max_players')
    if model.min_playtime and model.max_playtime and model.min_playtime > model.max_playtime:
        raise ValueError('min_playtime cannot exceed max_playtime')
    return model


class GameBase(BaseModel):
    name: str = Field(..., max_length=255)

    @field_validator('name', mode='before')
    @classmethod
    def strip_name(cls, v):
        return _strip_name(v)

    status: str = Field('owned', pattern='^(owned|wishlist|sold)$')
    year_published: Optional[int] = Field(None, ge=1800, le=2099)
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
    purchase_price: Optional[float] = Field(None, ge=0)
    purchase_location: Optional[str] = Field(None, max_length=255)
    location: Optional[str] = Field(None, max_length=255)
    show_location: bool = False
    user_rating: Optional[float] = Field(None, ge=1, le=10)
    user_notes: Optional[str] = Field(None, max_length=2000)
    last_played: Optional[date] = None
    parent_game_id: Optional[int] = Field(None, ge=1)
    bgg_id: Optional[int] = None
    bgg_rating: Optional[float] = Field(None, ge=1, le=10)
    priority: Optional[int] = Field(None, ge=1, le=5)
    target_price: Optional[float] = Field(None, ge=0)
    condition: Optional[str] = Field(None, pattern='^(New|Good|Fair|Poor)$')
    edition: Optional[str] = Field(None, max_length=255)

    @model_validator(mode='after')
    def check_min_max(self):
        return _validate_min_max(self)


class GameCreate(GameBase):
    pass


class GameUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)

    @field_validator('name', mode='before')
    @classmethod
    def strip_name(cls, v):
        return _strip_name(v)

    status: Optional[str] = Field(None, pattern='^(owned|wishlist|sold)$')
    year_published: Optional[int] = Field(None, ge=1800, le=2099)
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
    purchase_price: Optional[float] = Field(None, ge=0)
    purchase_location: Optional[str] = Field(None, max_length=255)
    location: Optional[str] = Field(None, max_length=255)
    show_location: Optional[bool] = None
    user_rating: Optional[float] = Field(None, ge=1, le=10)
    user_notes: Optional[str] = Field(None, max_length=2000)
    last_played: Optional[date] = None
    scan_glb_filename: Optional[str] = Field(None, max_length=255)
    scan_featured: Optional[bool] = None
    parent_game_id: Optional[int] = Field(None, ge=1)
    bgg_id: Optional[int] = None
    bgg_rating: Optional[float] = Field(None, ge=1, le=10)
    priority: Optional[int] = Field(None, ge=1, le=5)
    target_price: Optional[float] = Field(None, ge=0)
    condition: Optional[str] = Field(None, pattern='^(New|Good|Fair|Poor)$')
    edition: Optional[str] = Field(None, max_length=255)

    @model_validator(mode='after')
    def check_min_max(self):
        return _validate_min_max(self)


class GameResponse(GameBase):
    id: int
    image_cached: bool = False
    date_added: Optional[datetime] = None
    date_modified: Optional[datetime] = None
    parent_game_name: Optional[str] = None  # denormalized — joined in GET

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
    winner: Optional[str] = Field(None, max_length=255)
    player_names: Optional[List[str]] = None  # names to link/create as players


class PlaySessionResponse(PlaySessionCreate):
    id: int
    game_id: int
    date_added: Optional[datetime] = None
    players: List[str] = []  # resolved player names

    class Config:
        from_attributes = True


class PlayerCreate(BaseModel):
    name: str = Field(..., max_length=255)


class PlayerResponse(BaseModel):
    id: int
    name: str
    date_added: Optional[datetime] = None

    class Config:
        from_attributes = True


class ShareTokenResponse(BaseModel):
    token: str
    label: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GameSuggestion(BaseModel):
    id: int
    name: str
    image_url: Optional[str] = None
    min_players: Optional[int] = None
    max_players: Optional[int] = None
    min_playtime: Optional[int] = None
    max_playtime: Optional[int] = None
    difficulty: Optional[float] = None
    user_rating: Optional[float] = None
    last_played: Optional[date] = None
    reasons: List[str] = []


class SuggestRequest(BaseModel):
    player_count: Optional[int] = Field(None, ge=1)
    max_minutes: Optional[int] = Field(None, ge=1)


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
    session_counts: Dict[str, int]
    total_expansions: int = 0
