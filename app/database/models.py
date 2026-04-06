from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, LargeBinary, String, Text, UniqueConstraint

from .base import Base, engine


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), unique=True, nullable=False)
    password_hash = Column(String(128), nullable=False)
    private_key = Column(LargeBinary, nullable=False)
    certificate = Column(LargeBinary, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.now)

    def __repr__(self):
        return f"<User username={self.username} is_admin={self.is_admin}>"


class GroupKey(Base):
    __tablename__ = "group_keys"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), nullable=False, unique=True)
    wrapped_key = Column(LargeBinary, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    def __repr__(self):
        return f"<GroupKey username={self.username} version={self.version}>"


class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, autoincrement=True)
    work_id_enc = Column(Text, nullable=False)  # AES-GCM encrypted OpenLibrary work ID
    added_by = Column(String(64), nullable=False)
    created_at = Column(DateTime, default=datetime.now)

    def __repr__(self):
        return f"<Book added_by={self.added_by}>"


class Shelf(Base):
    __tablename__ = "shelves"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    owner_username = Column(String(64), nullable=False)
    created_at = Column(DateTime, default=datetime.now)

    def __repr__(self):
        return f"<Shelf id={self.id} name={self.name} owner={self.owner_username}>"


class ShelfMembership(Base):
    __tablename__ = "shelf_memberships"
    __table_args__ = (UniqueConstraint("shelf_id", "username"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    shelf_id = Column(Integer, nullable=False)
    username = Column(String(64), nullable=False)
    wrapped_key = Column(LargeBinary, nullable=False)
    key_version = Column(Integer, default=1, nullable=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    def __repr__(self):
        return f"<ShelfMembership shelf_id={self.shelf_id} username={self.username}>"


class ShelfBook(Base):
    __tablename__ = "shelf_books"

    id = Column(Integer, primary_key=True, autoincrement=True)
    shelf_id = Column(Integer, nullable=False)
    work_id_enc = Column(Text, nullable=False)
    work_id_hash = Column(String(64), nullable=True)  # SHA-256 of plaintext work_id for cross-shelf lookup
    added_by = Column(String(64), nullable=False)
    created_at = Column(DateTime, default=datetime.now)

    def __repr__(self):
        return f"<ShelfBook shelf_id={self.shelf_id} added_by={self.added_by}>"


class ShelfAccessRequest(Base):
    """Pending join requests (user-initiated) or invitations (owner-initiated)."""
    __tablename__ = "shelf_access_requests"
    __table_args__ = (UniqueConstraint("shelf_id", "target_username"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    shelf_id = Column(Integer, nullable=False)
    target_username = Column(String(64), nullable=False)
    request_type = Column(String(16), nullable=False)  # 'invite' | 'request'
    wrapped_key = Column(LargeBinary, nullable=True)   # pre-wrapped for invites
    created_at = Column(DateTime, default=datetime.now)

    def __repr__(self):
        return f"<ShelfAccessRequest shelf_id={self.shelf_id} target={self.target_username} type={self.request_type}>"


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    shelf_book_id = Column(Integer, nullable=False)
    reviewer_username = Column(String(64), nullable=False)
    review_enc = Column(Text, nullable=False)
    rating = Column(Integer, nullable=True)  # 1–5 stars
    created_at = Column(DateTime, default=datetime.now)

    def __repr__(self):
        return f"<Review shelf_book_id={self.shelf_book_id} reviewer={self.reviewer_username}>"


def init_db():
    Base.metadata.create_all(bind=engine)
    # Add work_id_hash column if missing (migration for existing databases)
    with engine.connect() as conn:
        from sqlalchemy import text
        try:
            conn.execute(text("ALTER TABLE shelf_books ADD COLUMN work_id_hash VARCHAR(64)"))
            conn.commit()
        except Exception:
            pass  # Column already exists
        try:
            conn.execute(text("ALTER TABLE reviews ADD COLUMN rating INTEGER"))
            conn.commit()
        except Exception:
            pass  # Column already exists
