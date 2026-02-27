from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Text, Date, DateTime
from database import Base


class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    year_published = Column(Integer, nullable=True)
    min_players = Column(Integer, nullable=True)
    max_players = Column(Integer, nullable=True)
    min_playtime = Column(Integer, nullable=True)
    max_playtime = Column(Integer, nullable=True)
    difficulty = Column(Float, nullable=True)  # BGG weight 1-5
    description = Column(Text, nullable=True)
    image_url = Column(Text, nullable=True)
    thumbnail_url = Column(Text, nullable=True)
    categories = Column(Text, nullable=True)   # JSON array as string
    mechanics = Column(Text, nullable=True)    # JSON array as string
    designers = Column(Text, nullable=True)    # JSON array as string
    publishers = Column(Text, nullable=True)   # JSON array as string
    user_rating = Column(Float, nullable=True)  # 1-10
    user_notes = Column(Text, nullable=True)
    last_played = Column(Date, nullable=True)
    # Python-side defaults so they work reliably with SQLite
    date_added = Column(DateTime, default=datetime.utcnow, nullable=False)
    date_modified = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
