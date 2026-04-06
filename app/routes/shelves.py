import binascii
import hashlib

from flask import jsonify, request, session

from app.routes import api
from app.crypto import decrypt_message, encrypt_message, generate_aes_key, is_encrypted
from app.database import (
    add_shelf_book, add_shelf_member, create_shelf, delete_shelf, get_shelf, get_shelf_books,
    get_user, get_user_shelves, set_shelf_book_hash,
)
from app.key_management import deserialize_certificate, wrap_group_key
from app.openlibrary import get_books_batch
from .helpers import _auth_required, _shelf_key


@api.route("/shelves", methods=["GET"])
def list_shelves():
    err = _auth_required()
    if err:
        return err

    username = session["username"]
    shelves = get_user_shelves(username)
    return jsonify({
        "shelves": [
            {
                "id": s.id,
                "name": s.name,
                "owner_username": s.owner_username,
                "is_owner": s.owner_username == username,
                "created_at": s.created_at.strftime("%Y-%m-%d %H:%M") if s.created_at else "",
            }
            for s in shelves
        ]
    })


@api.route("/shelves", methods=["POST"])
def create_shelf_route():
    err = _auth_required()
    if err:
        return err

    name = (request.get_json() or {}).get("name", "").strip()
    if not name:
        return jsonify({"error": "Shelf name required"}), 400

    username = session["username"]
    user = get_user(username)
    cert = deserialize_certificate(user.certificate)
    creator_public_key = cert.public_key()

    aes_key = generate_aes_key()
    wrapped_key = wrap_group_key(aes_key, creator_public_key)

    shelf = create_shelf(name, username)
    add_shelf_member(shelf.id, username, wrapped_key, version=1)

    shelf_keys = session.get("shelf_keys", {})
    shelf_keys[str(shelf.id)] = binascii.hexlify(aes_key).decode()
    session["shelf_keys"] = shelf_keys

    return jsonify({
        "id": shelf.id,
        "name": shelf.name,
        "owner_username": shelf.owner_username,
    }), 201


@api.route("/shelves/<int:shelf_id>/books", methods=["GET"])
def list_shelf_books(shelf_id: int):
    err = _auth_required()
    if err:
        return err

    aes_key = _shelf_key(shelf_id)
    if not aes_key:
        return jsonify({"error": "Not a member of this shelf"}), 403

    shelf = get_shelf(shelf_id)
    if not shelf:
        return jsonify({"error": "Shelf not found"}), 404

    books = get_shelf_books(shelf_id)
    result = []
    work_ids = []
    for b in books:
        work_id = decrypt_message(b.work_id_enc, aes_key) if is_encrypted(b.work_id_enc) else None
        # Lazily backfill work_id_hash for books added before the column existed
        if work_id and not b.work_id_hash:
            set_shelf_book_hash(b.id, hashlib.sha256(work_id.encode()).hexdigest())
        entry = {
            "id": b.id,
            "work_id": work_id,
            "added_by": b.added_by,
            "created_at": b.created_at.strftime("%Y-%m-%d %H:%M") if b.created_at else "",
        }
        result.append(entry)
        if work_id:
            work_ids.append(work_id)

    # Fetch book metadata from OpenLibrary in parallel and embed in response
    if work_ids:
        meta = get_books_batch(work_ids)
        for entry in result:
            if entry["work_id"] and entry["work_id"] in meta:
                m = meta[entry["work_id"]]
                entry["title"] = m.get("title")
                entry["author"] = m.get("author")
                entry["cover_id"] = m.get("cover_id")
                entry["year"] = m.get("year")

    return jsonify({
        "shelf": {"id": shelf.id, "name": shelf.name, "owner_username": shelf.owner_username},
        "books": result,
    })


@api.route("/shelves/<int:shelf_id>", methods=["DELETE"])
def delete_shelf_route(shelf_id: int):
    err = _auth_required()
    if err:
        return err

    username = session["username"]
    shelf = get_shelf(shelf_id)
    if not shelf:
        return jsonify({"error": "Shelf not found"}), 404
    if shelf.owner_username != username:
        return jsonify({"error": "Only the owner can delete a shelf"}), 403

    ok = delete_shelf(shelf_id, username)
    if not ok:
        return jsonify({"error": "Failed to delete shelf"}), 500

    shelf_keys = session.get("shelf_keys", {})
    shelf_keys.pop(str(shelf_id), None)
    session["shelf_keys"] = shelf_keys

    return jsonify({"ok": True})


@api.route("/shelves/<int:shelf_id>/books", methods=["POST"])
def add_book_to_shelf(shelf_id: int):
    err = _auth_required()
    if err:
        return err

    aes_key = _shelf_key(shelf_id)
    if not aes_key:
        return jsonify({"error": "Not a member of this shelf"}), 403

    work_id = (request.get_json() or {}).get("work_id", "").strip()
    if not work_id:
        return jsonify({"error": "work_id required"}), 400

    work_id_hash = hashlib.sha256(work_id.encode()).hexdigest()
    book = add_shelf_book(shelf_id, encrypt_message(work_id, aes_key), session["username"], work_id_hash)
    return jsonify({"id": book.id, "work_id": work_id, "added_by": book.added_by}), 201
