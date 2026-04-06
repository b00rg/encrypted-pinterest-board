import binascii

from flask import jsonify, request, session

from app.routes import api
from app.database import (
    add_shelf_member, create_access_request, delete_access_request,
    get_access_request, get_shelf, get_shelf_invitations, get_shelf_join_requests,
    get_shelf_member, get_shelf_members, get_user, get_user_pending_invitations,
    get_user_pending_requests, get_user_pending_requests_detailed,
    has_pending_access, search_shelves,
)
from app.key_management import deserialize_certificate, deserialize_private_key, unwrap_group_key, wrap_group_key
from .helpers import _auth_required, _shelf_key


# ── Discover ──────────────────────────────────────────────────────────

@api.route("/shelves/discover", methods=["GET"])
def discover_shelves():
    err = _auth_required()
    if err:
        return err

    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"shelves": []})

    username = session["username"]
    return jsonify({"shelves": search_shelves(q, username)})


# ── Join Requests (user-initiated) ────────────────────────────────────

@api.route("/shelves/<int:shelf_id>/join-requests", methods=["POST"])
def send_join_request(shelf_id: int):
    err = _auth_required()
    if err:
        return err

    username = session["username"]
    shelf = get_shelf(shelf_id)
    if not shelf:
        return jsonify({"error": "Shelf not found"}), 404
    if shelf.owner_username == username:
        return jsonify({"error": "You own this shelf"}), 400
    if get_shelf_member(shelf_id, username):
        return jsonify({"error": "Already a member"}), 400
    if has_pending_access(shelf_id, username):
        return jsonify({"error": "Request already pending"}), 400

    create_access_request(shelf_id, username, request_type="request")
    return jsonify({"message": "Join request sent"}), 201


@api.route("/shelves/<int:shelf_id>/join-requests", methods=["GET"])
def list_join_requests(shelf_id: int):
    err = _auth_required()
    if err:
        return err

    shelf = get_shelf(shelf_id)
    if not shelf:
        return jsonify({"error": "Shelf not found"}), 404
    if shelf.owner_username != session["username"]:
        return jsonify({"error": "Only the shelf owner can view requests"}), 403

    reqs = get_shelf_join_requests(shelf_id)
    return jsonify({
        "requests": [
            {"id": r.id, "username": r.target_username,
             "created_at": r.created_at.strftime("%Y-%m-%d") if r.created_at else ""}
            for r in reqs
        ]
    })


@api.route("/shelves/<int:shelf_id>/join-requests/<int:req_id>/approve", methods=["POST"])
def approve_join_request(shelf_id: int, req_id: int):
    err = _auth_required()
    if err:
        return err

    shelf = get_shelf(shelf_id)
    if not shelf:
        return jsonify({"error": "Shelf not found"}), 404
    if shelf.owner_username != session["username"]:
        return jsonify({"error": "Only the shelf owner can approve requests"}), 403

    aes_key = _shelf_key(shelf_id)
    if not aes_key:
        return jsonify({"error": "Shelf key not in session"}), 400

    req = get_access_request(req_id)
    if not req or req.shelf_id != shelf_id or req.request_type != "request":
        return jsonify({"error": "Request not found"}), 404

    user = get_user(req.target_username)
    if not user:
        return jsonify({"error": "User not found"}), 404

    cert = deserialize_certificate(user.certificate)
    wrapped = wrap_group_key(aes_key, cert.public_key())
    existing = get_shelf_members(shelf_id)
    version = existing[0].key_version if existing else 1
    add_shelf_member(shelf_id, req.target_username, wrapped, version=version)
    delete_access_request(req_id)

    return jsonify({"message": f"{req.target_username} approved"})


@api.route("/shelves/<int:shelf_id>/join-requests/<int:req_id>", methods=["DELETE"])
def delete_join_request(shelf_id: int, req_id: int):
    err = _auth_required()
    if err:
        return err

    req = get_access_request(req_id)
    if not req or req.shelf_id != shelf_id or req.request_type != "request":
        return jsonify({"error": "Request not found"}), 404

    username = session["username"]
    shelf = get_shelf(shelf_id)
    is_owner = shelf and shelf.owner_username == username
    is_requester = req.target_username == username

    if not is_owner and not is_requester:
        return jsonify({"error": "Not authorised"}), 403

    delete_access_request(req_id)
    return jsonify({"message": "Request removed"})


@api.route("/shelves/<int:shelf_id>/join-requests/mine", methods=["DELETE"])
def cancel_my_join_request(shelf_id: int):
    """Cancel the current user's own join request for a shelf."""
    err = _auth_required()
    if err:
        return err

    username = session["username"]
    from app.database import SessionLocal, ShelfAccessRequest
    with SessionLocal() as db_session:
        req = db_session.query(ShelfAccessRequest).filter_by(
            shelf_id=shelf_id, target_username=username, request_type="request"
        ).first()
        if not req:
            return jsonify({"error": "No pending request found"}), 404
        db_session.delete(req)
        db_session.commit()
    return jsonify({"message": "Request cancelled"})


# ── Invitations (owner-initiated) ─────────────────────────────────────

@api.route("/shelves/<int:shelf_id>/invitations", methods=["POST"])
def send_invitation(shelf_id: int):
    err = _auth_required()
    if err:
        return err

    shelf = get_shelf(shelf_id)
    if not shelf:
        return jsonify({"error": "Shelf not found"}), 404
    if shelf.owner_username != session["username"]:
        return jsonify({"error": "Only the shelf owner can invite members"}), 403

    aes_key = _shelf_key(shelf_id)
    if not aes_key:
        return jsonify({"error": "Shelf key not in session"}), 400

    target = (request.get_json() or {}).get("username", "").strip()
    if not target:
        return jsonify({"error": "Username required"}), 400

    user = get_user(target)
    if not user:
        return jsonify({"error": "User not found"}), 404
    if get_shelf_member(shelf_id, target):
        return jsonify({"error": "Already a member"}), 400
    if has_pending_access(shelf_id, target):
        return jsonify({"error": "Invite or request already pending"}), 400

    cert = deserialize_certificate(user.certificate)
    wrapped = wrap_group_key(aes_key, cert.public_key())
    create_access_request(shelf_id, target, request_type="invite", wrapped_key=wrapped)

    return jsonify({"message": f"Invitation sent to {target}"}), 201


@api.route("/shelves/<int:shelf_id>/invitations", methods=["GET"])
def list_invitations(shelf_id: int):
    err = _auth_required()
    if err:
        return err

    shelf = get_shelf(shelf_id)
    if not shelf:
        return jsonify({"error": "Shelf not found"}), 404
    if shelf.owner_username != session["username"]:
        return jsonify({"error": "Only the shelf owner can view invitations"}), 403

    invites = get_shelf_invitations(shelf_id)
    return jsonify({
        "invitations": [
            {"id": i.id, "username": i.target_username,
             "created_at": i.created_at.strftime("%Y-%m-%d") if i.created_at else ""}
            for i in invites
        ]
    })


@api.route("/shelves/<int:shelf_id>/invitations/<int:inv_id>", methods=["DELETE"])
def cancel_invitation(shelf_id: int, inv_id: int):
    err = _auth_required()
    if err:
        return err

    shelf = get_shelf(shelf_id)
    if not shelf or shelf.owner_username != session["username"]:
        return jsonify({"error": "Not authorised"}), 403

    inv = get_access_request(inv_id)
    if not inv or inv.shelf_id != shelf_id or inv.request_type != "invite":
        return jsonify({"error": "Invitation not found"}), 404

    delete_access_request(inv_id)
    return jsonify({"message": "Invitation cancelled"})


# ── User: view & respond to invitations ──────────────────────────────

@api.route("/user/invitations", methods=["GET"])
def user_invitations():
    err = _auth_required()
    if err:
        return err

    return jsonify({"invitations": get_user_pending_invitations(session["username"])})


@api.route("/user/invitations/<int:inv_id>/accept", methods=["POST"])
def accept_invitation(inv_id: int):
    err = _auth_required()
    if err:
        return err

    username = session["username"]
    password = (request.get_json() or {}).get("password", "")
    if not password:
        return jsonify({"error": "Password required to unwrap the shelf key"}), 400

    inv = get_access_request(inv_id)
    if not inv or inv.target_username != username or inv.request_type != "invite":
        return jsonify({"error": "Invitation not found"}), 404

    user = get_user(username)
    try:
        private_key = deserialize_private_key(user.private_key, password.encode())
    except Exception:
        return jsonify({"error": "Incorrect password"}), 401

    try:
        shelf_aes = unwrap_group_key(inv.wrapped_key, private_key)
    except Exception:
        return jsonify({"error": "Failed to unwrap shelf key"}), 500

    existing = get_shelf_members(inv.shelf_id)
    version = existing[0].key_version if existing else 1
    add_shelf_member(inv.shelf_id, username, inv.wrapped_key, version=version)

    shelf_keys = session.get("shelf_keys", {})
    shelf_keys[str(inv.shelf_id)] = binascii.hexlify(shelf_aes).decode()
    session["shelf_keys"] = shelf_keys

    delete_access_request(inv_id)
    shelf = get_shelf(inv.shelf_id)
    return jsonify({"shelf_id": inv.shelf_id, "shelf_name": shelf.name if shelf else ""})


@api.route("/user/invitations/<int:inv_id>", methods=["DELETE"])
def decline_invitation(inv_id: int):
    err = _auth_required()
    if err:
        return err

    username = session["username"]
    inv = get_access_request(inv_id)
    if not inv or inv.target_username != username or inv.request_type != "invite":
        return jsonify({"error": "Invitation not found"}), 404

    delete_access_request(inv_id)
    return jsonify({"message": "Invitation declined"})


# ── User: pending requests they sent ─────────────────────────────────

@api.route("/user/pending-requests", methods=["GET"])
def user_pending_requests():
    err = _auth_required()
    if err:
        return err

    shelf_ids = get_user_pending_requests(session["username"])
    return jsonify({"shelf_ids": shelf_ids})


@api.route("/user/pending-requests-detailed", methods=["GET"])
def user_pending_requests_detailed():
    err = _auth_required()
    if err:
        return err

    return jsonify({"requests": get_user_pending_requests_detailed(session["username"])})
