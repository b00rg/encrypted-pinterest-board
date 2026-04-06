from .base import SessionLocal
from .models import Review, Shelf, ShelfBook


def add_review(shelf_book_id: int, reviewer_username: str, review_enc: str, rating: int | None = None) -> Review:
    with SessionLocal() as session:
        review = Review(
            shelf_book_id=shelf_book_id,
            reviewer_username=reviewer_username,
            review_enc=review_enc,
            rating=rating,
        )
        session.add(review)
        session.commit()
        session.refresh(review)
        session.expunge(review)
        return review


def get_reviews(shelf_book_id: int) -> list[Review]:
    with SessionLocal() as session:
        reviews = session.query(Review).filter_by(shelf_book_id=shelf_book_id).order_by(
            Review.created_at.asc()
        ).all()
        session.expunge_all()
        return reviews


def get_all_reviews_with_context() -> list[dict]:
    """Returns all reviews with shelf/book context as plain dicts (safe to use outside session)."""
    with SessionLocal() as session:
        results = (
            session.query(Review, ShelfBook, Shelf)
            .join(ShelfBook, Review.shelf_book_id == ShelfBook.id)
            .join(Shelf, ShelfBook.shelf_id == Shelf.id)
            .order_by(Review.created_at.asc())
            .all()
        )
        output = []
        for review, shelf_book, shelf in results:
            output.append({
                "review_id": review.id,
                "shelf_book_id": review.shelf_book_id,
                "reviewer_username": review.reviewer_username,
                "review_enc": review.review_enc,
                "created_at": review.created_at,
                "shelf_id": shelf.id,
                "shelf_name": shelf.name,
                "shelf_owner": shelf.owner_username,
                "work_id_enc": shelf_book.work_id_enc,
                "book_id": shelf_book.id,
                "added_by": shelf_book.added_by,
            })
        return output
