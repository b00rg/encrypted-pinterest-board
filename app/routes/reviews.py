import hashlib

from flask import jsonify, request, session

from app.routes import api
from app.crypto import decrypt_message, encrypt_message, is_encrypted
from app.database import (
    add_review, get_all_reviews_with_context, get_reviews, get_shelf, get_shelf_book,
    get_shelf_books, get_shelf_books_by_hash, get_user_shelf_memberships, set_shelf_book_hash,
)
from .helpers import _auth_required, _shelf_key


@api.route("/reviews/for-work")
def reviews_for_work():
    """Return reviews for a book across all shelves.

    - Shelves the user is a member of: reviews are decrypted.
    - Shelves the user is NOT a member of: reviews are returned as encrypted
      ciphertext (review=None, encrypted=True) so the frontend can display
      them as locked.
    """
    err = _auth_required()
    if err:
        return err

    work_id = request.args.get("work_id", "").strip()
    if not work_id:
        return jsonify({"error": "work_id required"}), 400

    username = session["username"]
    work_id_hash = hashlib.sha256(work_id.encode()).hexdigest()

    # Build a set of shelf IDs the current user is a member of
    member_shelf_ids = {m.shelf_id for m in get_user_shelf_memberships(username)}

    results = []
    seen_book_ids: set[int] = set()

    # Use hash-based lookup when available (fast path)
    hash_books = get_shelf_books_by_hash(work_id_hash)

    # Also check member shelves via decryption for books added before hash column existed
    member_books_by_shelf: dict[int, list] = {}
    for m_shelf_id in member_shelf_ids:
        aes_key = _shelf_key(m_shelf_id)
        if not aes_key:
            continue
        for b in get_shelf_books(m_shelf_id):
            if b.id in seen_book_ids:
                continue
            if b.work_id_hash == work_id_hash:
                continue  # already covered by hash_books
            if not is_encrypted(b.work_id_enc):
                continue
            try:
                if decrypt_message(b.work_id_enc, aes_key) == work_id:
                    # Lazily backfill the hash so non-members can discover this book
                    if not b.work_id_hash:
                        set_shelf_book_hash(b.id, work_id_hash)
                        b.work_id_hash = work_id_hash
                    member_books_by_shelf.setdefault(m_shelf_id, []).append(b)
            except Exception:
                continue

    all_books = list(hash_books) + [b for bs in member_books_by_shelf.values() for b in bs]

    for b in all_books:
        if b.id in seen_book_ids:
            continue
        seen_book_ids.add(b.id)

        shelf = get_shelf(b.shelf_id)
        if not shelf:
            continue

        is_member = b.shelf_id in member_shelf_ids
        aes_key = _shelf_key(b.shelf_id) if is_member else None

        db_reviews = list(get_reviews(b.id))
        shelf_reviews = []
        for r in db_reviews:
            if is_member and aes_key:
                try:
                    decrypted = decrypt_message(r.review_enc, aes_key) if is_encrypted(r.review_enc) else None
                except Exception:
                    decrypted = None
                shelf_reviews.append({
                    "id": r.id,
                    "reviewer_username": r.reviewer_username,
                    "review": decrypted,
                    "review_enc": r.review_enc,
                    "rating": r.rating,
                    "encrypted": False,
                    "created_at": r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else "",
                })
            else:
                # User is not a member — show encrypted ciphertext only, hide individual rating
                shelf_reviews.append({
                    "id": r.id,
                    "reviewer_username": r.reviewer_username,
                    "review": None,
                    "review_enc": r.review_enc,
                    "rating": None,
                    "encrypted": True,
                    "created_at": r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else "",
                })

        # Compute average rating across all reviews (plaintext column, visible to anyone as aggregate)
        all_ratings = [r.rating for r in db_reviews if r.rating is not None]
        avg_rating = round(sum(all_ratings) / len(all_ratings), 1) if all_ratings else None

        results.append({
            "shelf_id": shelf.id,
            "shelf_name": shelf.name,
            "book_id": b.id,
            "is_member": is_member,
            "avg_rating": avg_rating,
            "reviews": shelf_reviews,
        })

    return jsonify({"results": results})


@api.route("/all-encrypted-reviews")
def all_encrypted_reviews():
    err = _auth_required()
    if err:
        return err

    username = session["username"]
    user_shelf_ids = {str(m.shelf_id) for m in get_user_shelf_memberships(username)}

    results = []
    for entry in get_all_reviews_with_context():
        shelf_id_str = str(entry["shelf_id"])
        is_member = shelf_id_str in user_shelf_ids
        aes_key = _shelf_key(entry["shelf_id"]) if is_member else None
        decrypted = None
        if aes_key and is_encrypted(entry["review_enc"]):
            decrypted = decrypt_message(entry["review_enc"], aes_key)
        results.append({
            "id": entry["review_id"],
            "shelf_id": entry["shelf_id"],
            "shelf_name": entry["shelf_name"],
            "book_id": entry["book_id"],
            "reviewer_username": entry["reviewer_username"],
            "review_enc": entry["review_enc"],
            "review": decrypted,
            "is_member": is_member,
            "created_at": entry["created_at"].strftime("%Y-%m-%d %H:%M") if entry["created_at"] else "",
        })

    return jsonify({"reviews": results})


@api.route("/shelves/<int:shelf_id>/books/<int:book_id>/reviews", methods=["GET"])
def get_book_reviews(shelf_id: int, book_id: int):
    err = _auth_required()
    if err:
        return err

    aes_key = _shelf_key(shelf_id)
    if not aes_key:
        return jsonify({"error": "Not a member of this shelf"}), 403

    book = get_shelf_book(book_id)
    if not book or book.shelf_id != shelf_id:
        return jsonify({"error": "Book not found on this shelf"}), 404

    reviews = get_reviews(book_id)
    return jsonify({
        "reviews": [
            {
                "id": r.id,
                "reviewer_username": r.reviewer_username,
                "review": decrypt_message(r.review_enc, aes_key) if is_encrypted(r.review_enc) else None,
                "review_enc": r.review_enc,
                "rating": r.rating,
                "created_at": r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else "",
            }
            for r in reviews
        ]
    })


@api.route("/shelves/<int:shelf_id>/books/<int:book_id>/reviews", methods=["POST"])
def post_review(shelf_id: int, book_id: int):
    err = _auth_required()
    if err:
        return err

    aes_key = _shelf_key(shelf_id)
    if not aes_key:
        return jsonify({"error": "Not a member of this shelf"}), 403

    book = get_shelf_book(book_id)
    if not book or book.shelf_id != shelf_id:
        return jsonify({"error": "Book not found on this shelf"}), 404

    body = request.get_json() or {}
    review_text = body.get("review", "").strip()
    if not review_text:
        return jsonify({"error": "Review text required"}), 400

    raw_rating = body.get("rating")
    rating = None
    if raw_rating is not None:
        try:
            rating = min(5, max(1, int(raw_rating)))
        except (ValueError, TypeError):
            rating = None

    review = add_review(book_id, session["username"], encrypt_message(review_text, aes_key), rating)
    return jsonify({
        "id": review.id,
        "reviewer_username": review.reviewer_username,
        "review": review_text,
        "rating": review.rating,
        "created_at": review.created_at.strftime("%Y-%m-%d %H:%M") if review.created_at else "",
    }), 201
