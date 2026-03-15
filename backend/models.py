from datetime import datetime, timezone
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
    scan_glb_filename = Column(String(255), nullable=True)
    scan_featured = Column(Boolean, default=False, nullable=False)
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
    location = Column(String(255), nullable=True)
    show_location = Column(Boolean, default=False, nullable=False)
    last_played = Column(Date, nullable=True)
    # Python-side defaults so they work reliably with SQLite
    date_added = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    date_modified = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    parent_game_id = Column(Integer, ForeignKey("games.id"), nullable=True, index=True)
    # New fields
    bgg_id = Column(Integer, nullable=True, index=True)
    bgg_rating = Column(Float, nullable=True)  # BGG community average rating
    priority = Column(Integer, nullable=True)  # 1-5 wishlist priority
    target_price = Column(Float, nullable=True)  # wishlist target price
    condition = Column(String(20), nullable=True)  # New/Good/Fair/Poor
    edition = Column(String(255), nullable=True)  # edition/version string


class GameImage(Base):
    __tablename__ = "game_images"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    caption = Column(String(500), nullable=True)
    date_added = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class PlaySession(Base):
    __tablename__ = "play_sessions"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False, index=True)
    played_at = Column(Date, nullable=False)
    player_count = Column(Integer, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    winner = Column(String(255), nullable=True)
    date_added = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class Player(Base):
    __tablename__ = "players"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    date_added = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class SessionPlayer(Base):
    __tablename__ = "session_players"

    session_id = Column(Integer, ForeignKey("play_sessions.id", ondelete="CASCADE"), primary_key=True)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), primary_key=True)


class ShareToken(Base):
    __tablename__ = "share_tokens"

    token = Column(String(64), primary_key=True)
    label = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


# ===== Tag Junction Tables =====
# Each tag type has a lookup table (unique names) and a pivot table linking games to tags.
# The old TEXT columns on Game are kept for backward compatibility / rollback safety.

class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False, unique=True, index=True)

class GameCategory(Base):
    __tablename__ = "game_categories"
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), primary_key=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True)


class Mechanic(Base):
    __tablename__ = "mechanics"
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False, unique=True, index=True)

class GameMechanic(Base):
    __tablename__ = "game_mechanics"
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), primary_key=True)
    mechanic_id = Column(Integer, ForeignKey("mechanics.id", ondelete="CASCADE"), primary_key=True)


class Designer(Base):
    __tablename__ = "designers"
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False, unique=True, index=True)

class GameDesigner(Base):
    __tablename__ = "game_designers"
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), primary_key=True)
    designer_id = Column(Integer, ForeignKey("designers.id", ondelete="CASCADE"), primary_key=True)


class Publisher(Base):
    __tablename__ = "publishers"
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False, unique=True, index=True)

class GamePublisher(Base):
    __tablename__ = "game_publishers"
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), primary_key=True)
    publisher_id = Column(Integer, ForeignKey("publishers.id", ondelete="CASCADE"), primary_key=True)


class Label(Base):
    __tablename__ = "labels"
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False, unique=True, index=True)

class GameLabel(Base):
    __tablename__ = "game_labels"
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), primary_key=True)
    label_id = Column(Integer, ForeignKey("labels.id", ondelete="CASCADE"), primary_key=True)
