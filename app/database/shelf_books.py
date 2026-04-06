from .base import SessionLocal
from .models import Review, Shelf, ShelfAccessRequest, ShelfBook, ShelfMembership


def add_shelf_book(shelf_id: int, work_id_enc: str, added_by: str, work_id_hash: str | None = None) -> ShelfBook:
    with SessionLocal() as session:
        book = ShelfBook(shelf_id=shelf_id, work_id_enc=work_id_enc, added_by=added_by, work_id_hash=work_id_hash)
        session.add(book)
        session.commit()
        session.refresh(book)
        session.expunge(book)
        return book


def get_shelf_books(shelf_id: int) -> list[ShelfBook]:
    with SessionLocal() as session:
        books = session.query(ShelfBook).filter_by(shelf_id=shelf_id).order_by(
            ShelfBook.created_at.desc()
        ).all()
        session.expunge_all()
        return books


def get_shelf_books_by_hash(work_id_hash: str) -> list[ShelfBook]:
    """Return all ShelfBook rows whose work_id_hash matches (across all shelves)."""
    with SessionLocal() as session:
        books = session.query(ShelfBook).filter_by(work_id_hash=work_id_hash).all()
        session.expunge_all()
        return books


def get_shelf_book(book_id: int) -> ShelfBook | None:
    with SessionLocal() as session:
        book = session.query(ShelfBook).filter_by(id=book_id).first()
        if book:
            session.expunge(book)
        return book


def set_shelf_book_hash(book_id: int, work_id_hash: str) -> None:
    """Lazily backfill work_id_hash for books added before the column existed."""
    with SessionLocal() as session:
        book = session.query(ShelfBook).filter_by(id=book_id).first()
        if book and not book.work_id_hash:
            book.work_id_hash = work_id_hash
            session.commit()


def delete_shelf_book(book_id: int) -> bool:
    with SessionLocal() as session:
        book = session.query(ShelfBook).filter_by(id=book_id).first()
        if not book:
            return False
        session.query(Review).filter_by(shelf_book_id=book_id).delete()
        session.delete(book)
        session.commit()
        return True


def search_shelves(query: str, exclude_username: str) -> list[dict]:
    """Search shelves by name, excluding ones the user is already a member of."""
    with SessionLocal() as session:
        member_shelf_ids = [
            m.shelf_id for m in
            session.query(ShelfMembership).filter_by(username=exclude_username).all()
        ]
        shelves = (
            session.query(Shelf)
            .filter(Shelf.name.ilike(f"%{query}%"))
            .filter(~Shelf.id.in_(member_shelf_ids) if member_shelf_ids else True)
            .limit(20)
            .all()
        )
        pending_shelf_ids = set(
            r.shelf_id for r in
            session.query(ShelfAccessRequest).filter(
                ShelfAccessRequest.target_username == exclude_username
            ).all()
        )
        result = []
        for s in shelves:
            result.append({
                "id": s.id,
                "name": s.name,
                "owner_username": s.owner_username,
                "has_pending_request": s.id in pending_shelf_ids,
            })
        return result


def add_book(work_id_enc: str, added_by: str):
    from .models import Book
    with SessionLocal() as session:
        book = Book(work_id_enc=work_id_enc, added_by=added_by)
        session.add(book)
        session.commit()
        session.refresh(book)
        session.expunge(book)
        return book


def get_all_books():
    from .models import Book
    with SessionLocal() as session:
        books = session.query(Book).order_by(Book.created_at.desc()).all()
        session.expunge_all()
        return books


def get_global_book(book_id: int):
    from .models import Book
    with SessionLocal() as session:
        book = session.query(Book).filter_by(id=book_id).first()
        if book:
            session.expunge(book)
        return book


def delete_global_book(book_id: int) -> bool:
    from .models import Book
    with SessionLocal() as session:
        book = session.query(Book).filter_by(id=book_id).first()
        if not book:
            return False
        session.delete(book)
        session.commit()
        return True
