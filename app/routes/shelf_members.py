import binascii

from flask import jsonify, request, session

from app.routes import api
from app.database import (
    add_shelf_member, delete_shelf_book, get_shelf, get_shelf_book, get_shelf_member,
    get_shelf_member_certificates, get_shelf_members, get_user, remove_shelf_member,
    update_shelf_keys,
)
from app.key_management import add_member, remove_member
from .helpers import _auth_required, _shelf_key


@api.route("/shelves/<int:shelf_id>/members", methods=["GET"])
def list_shelf_members(shelf_id: int):
    err = _auth_required()
    if err:
        return err

    shelf = get_shelf(shelf_id)
    if not shelf:
        return jsonify({"error": "Shelf not found"}), 404

    # Any shelf member (not just the owner) can view the member list
    username = session["username"]
    if shelf.owner_username != username and not _shelf_key(shelf_id):
        return jsonify({"error": "Not a member of this shelf"}), 403

    members = get_shelf_members(shelf_id)
    is_owner = shelf.owner_username == username
    return jsonify({
        "members": [
            {"username": m.username, "key_version": m.key_version}
            for m in members
        ],
        "is_owner": is_owner,
    })


@api.route("/shelves/<int:shelf_id>/members", methods=["POST"])
def add_shelf_member_route(shelf_id: int):
    err = _auth_required()
    if err:
        return err

    shelf = get_shelf(shelf_id)
    if not shelf:
        return jsonify({"error": "Shelf not found"}), 404
    if shelf.owner_username != session["username"]:
        return jsonify({"error": "Only the shelf owner can add members"}), 403

    aes_key = _shelf_key(shelf_id)
    if not aes_key:
        return jsonify({"error": "No shelf key in session"}), 400

    target = (request.get_json() or {}).get("username", "").strip()
    user = get_user(target)
    if not user:
        return jsonify({"error": "User not found"}), 404
    if get_shelf_member(shelf_id, target):
        return jsonify({"error": "Already a member"}), 400

    current_version = get_shelf_members(shelf_id)[0].key_version
    add_shelf_member(shelf_id, target, add_member(aes_key, user.certificate), version=current_version)
    return jsonify({"message": f"{target} added to shelf"})


@api.route("/shelves/<int:shelf_id>/members/<string:username>", methods=["DELETE"])
def remove_shelf_member_route(shelf_id: int, username: str):
    err = _auth_required()
    if err:
        return err

    shelf = get_shelf(shelf_id)
    if not shelf:
        return jsonify({"error": "Shelf not found"}), 404
    if shelf.owner_username != session["username"]:
        return jsonify({"error": "Only the shelf owner can remove members"}), 403
    if username == session["username"]:
        return jsonify({"error": "Cannot remove yourself"}), 400

    if not remove_shelf_member(shelf_id, username):
        return jsonify({"error": "User is not a member"}), 404

    remaining = get_shelf_member_certificates(shelf_id)
    if remaining:
        remaining_certs = [cert for _, cert in remaining]
        new_key, new_wrapped_keys = remove_member(remaining_certs)
        members = get_shelf_members(shelf_id)
        new_version = (members[0].key_version + 1) if members else 1
        update_shelf_keys(shelf_id, new_wrapped_keys, new_version)

        shelf_keys = session.get("shelf_keys", {})
        shelf_keys[str(shelf_id)] = binascii.hexlify(new_key).decode()
        session["shelf_keys"] = shelf_keys

    return jsonify({"message": f"{username} removed and shelf re-keyed"})


@api.route("/shelves/<int:shelf_id>/books/<int:book_id>", methods=["DELETE"])
def delete_shelf_book_route(shelf_id: int, book_id: int):
    err = _auth_required()
    if err:
        return err

    shelf = get_shelf(shelf_id)
    if not shelf:
        return jsonify({"error": "Shelf not found"}), 404

    aes_key = _shelf_key(shelf_id)
    if not aes_key:
        return jsonify({"error": "Not a member of this shelf"}), 403

    book = get_shelf_book(book_id)
    if not book or book.shelf_id != shelf_id:
        return jsonify({"error": "Book not found on this shelf"}), 404

    username = session["username"]
    if book.added_by != username and shelf.owner_username != username:
        return jsonify({"error": "Only the book adder or shelf owner can remove it"}), 403

    delete_shelf_book(book_id)
    return jsonify({"message": "Book removed from shelf"})
