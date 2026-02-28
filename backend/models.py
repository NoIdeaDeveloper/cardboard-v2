from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Text, Date, DateTime, Boolean, ForeignKey
from database import Base


class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    status = Column(String(20), default='owned', nullable=False, index=True)
    year_published = Column(Integer, nullable=True)
    min_players = Column(Integer, nullable=True)
    max_players = Column(Integer, nullable=True)
    min_playtime = Column(Integer, nullable=True)
    max_playtime = Column(Integer, nullable=True)
    difficulty = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    image_url = Column(Text, nullable=True)
    thumbnail_url = Column(Text, nullable=True)
    image_cached = Column(Boolean, default=False, nullable=False)
    instructions_filename = Column(Text, nullable=True)
    scan_filename = Column(Text, nullable=True)
    categories = Column(Text, nullable=True)   # JSON array as string
    mechanics = Column(Text, nullable=True)    # JSON array as string
    designers = Column(Text, nullable=True)    # JSON array as string
    publishers = Column(Text, nullable=True)   # JSON array as string
    labels = Column(Text, nullable=True)       # JSON array as string
    purchase_date = Column(Date, nullable=True)
    purchase_price = Column(Float, nullable=True)
    purchase_location = Column(String(255), nullable=True)
    user_rating = Column(Float, nullable=True)  # 1-10
    user_notes = Column(Text, nullable=True)
    last_played = Column(Date, nullable=True)
    # Python-side defaults so they work reliably with SQLite
    date_added = Column(DateTime, default=datetime.utcnow, nullable=False)
    date_modified = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class PlaySession(Base):
    __tablename__ = "play_sessions"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False, index=True)
    played_at = Column(Date, nullable=False)
    player_count = Column(Integer, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    date_added = Column(DateTime, default=datetime.utcnow, nullable=False)
