from datetime import datetime

from .base import SessionLocal
from .models import Review, Shelf, ShelfBook, ShelfMembership, User


def create_shelf(name: str, owner_username: str) -> Shelf:
    with SessionLocal() as session:
        shelf = Shelf(name=name, owner_username=owner_username)
        session.add(shelf)
        session.commit()
        session.refresh(shelf)
        session.expunge(shelf)
        return shelf


def get_shelf(shelf_id: int) -> Shelf | None:
    with SessionLocal() as session:
        shelf = session.query(Shelf).filter_by(id=shelf_id).first()
        if shelf:
            session.expunge(shelf)
        return shelf


def get_user_shelves(username: str) -> list[Shelf]:
    with SessionLocal() as session:
        shelf_ids = [
            m.shelf_id for m in
            session.query(ShelfMembership).filter_by(username=username).all()
        ]
        if not shelf_ids:
            return []
        shelves = session.query(Shelf).filter(Shelf.id.in_(shelf_ids)).all()
        session.expunge_all()
        return shelves


def add_shelf_member(shelf_id: int, username: str, wrapped_key: bytes, version: int = 1):
    with SessionLocal() as session:
        existing = session.query(ShelfMembership).filter_by(
            shelf_id=shelf_id, username=username
        ).first()
        if existing:
            existing.wrapped_key = wrapped_key
            existing.key_version = version
            existing.updated_at = datetime.now()
        else:
            session.add(ShelfMembership(
                shelf_id=shelf_id, username=username,
                wrapped_key=wrapped_key, key_version=version,
            ))
        session.commit()


def get_shelf_member(shelf_id: int, username: str) -> ShelfMembership | None:
    with SessionLocal() as session:
        m = session.query(ShelfMembership).filter_by(
            shelf_id=shelf_id, username=username
        ).first()
        if m:
            session.expunge(m)
        return m


def get_shelf_members(shelf_id: int) -> list[ShelfMembership]:
    with SessionLocal() as session:
        members = session.query(ShelfMembership).filter_by(shelf_id=shelf_id).all()
        session.expunge_all()
        return members


def get_shelf_member_certificates(shelf_id: int) -> list[tuple[str, bytes]]:
    """Returns list of (username, certificate_pem) for all shelf members."""
    with SessionLocal() as session:
        members = session.query(ShelfMembership).filter_by(shelf_id=shelf_id).all()
        result = []
        for m in members:
            user = session.query(User).filter_by(username=m.username).first()
            if user:
                result.append((m.username, bytes(user.certificate)))
        return result


def remove_shelf_member(shelf_id: int, username: str) -> bool:
    with SessionLocal() as session:
        m = session.query(ShelfMembership).filter_by(
            shelf_id=shelf_id, username=username
        ).first()
        if not m:
            return False
        session.delete(m)
        session.commit()
        return True


def update_shelf_keys(shelf_id: int, wrapped_keys: dict, version: int):
    with SessionLocal() as session:
        for username, wrapped_key in wrapped_keys.items():
            m = session.query(ShelfMembership).filter_by(
                shelf_id=shelf_id, username=username
            ).first()
            if m:
                m.wrapped_key = wrapped_key
                m.key_version = version
                m.updated_at = datetime.now()
        session.commit()


def get_user_shelf_memberships(username: str) -> list[ShelfMembership]:
    with SessionLocal() as session:
        memberships = session.query(ShelfMembership).filter_by(username=username).all()
        session.expunge_all()
        return memberships


def delete_shelf(shelf_id: int, owner_username: str) -> bool:
    with SessionLocal() as session:
        shelf = session.query(Shelf).filter_by(id=shelf_id, owner_username=owner_username).first()
        if not shelf:
            return False
        book_ids = [b.id for b in session.query(ShelfBook).filter_by(shelf_id=shelf_id).all()]
        if book_ids:
            session.query(Review).filter(Review.shelf_book_id.in_(book_ids)).delete(
                synchronize_session=False
            )
        session.query(ShelfBook).filter_by(shelf_id=shelf_id).delete()
        session.query(ShelfMembership).filter_by(shelf_id=shelf_id).delete()
        session.delete(shelf)
        session.commit()
        return True
