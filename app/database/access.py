from .base import SessionLocal
from .models import Shelf, ShelfAccessRequest


def create_access_request(
    shelf_id: int, target_username: str, request_type: str, wrapped_key: bytes | None = None
) -> ShelfAccessRequest:
    with SessionLocal() as session:
        req = ShelfAccessRequest(
            shelf_id=shelf_id,
            target_username=target_username,
            request_type=request_type,
            wrapped_key=wrapped_key,
        )
        session.add(req)
        session.commit()
        session.refresh(req)
        session.expunge(req)
        return req


def get_access_request(req_id: int) -> ShelfAccessRequest | None:
    with SessionLocal() as session:
        req = session.query(ShelfAccessRequest).filter_by(id=req_id).first()
        if req:
            session.expunge(req)
        return req


def has_pending_access(shelf_id: int, target_username: str) -> bool:
    with SessionLocal() as session:
        return session.query(ShelfAccessRequest).filter_by(
            shelf_id=shelf_id, target_username=target_username
        ).first() is not None


def get_shelf_join_requests(shelf_id: int) -> list[ShelfAccessRequest]:
    """Join requests (user-initiated) for a shelf."""
    with SessionLocal() as session:
        reqs = session.query(ShelfAccessRequest).filter_by(
            shelf_id=shelf_id, request_type="request"
        ).order_by(ShelfAccessRequest.created_at.asc()).all()
        session.expunge_all()
        return reqs


def get_shelf_invitations(shelf_id: int) -> list[ShelfAccessRequest]:
    """Invitations (owner-initiated) for a shelf."""
    with SessionLocal() as session:
        reqs = session.query(ShelfAccessRequest).filter_by(
            shelf_id=shelf_id, request_type="invite"
        ).order_by(ShelfAccessRequest.created_at.asc()).all()
        session.expunge_all()
        return reqs


def get_user_pending_invitations(username: str) -> list[dict]:
    """Returns invitations pending for a user, enriched with shelf info."""
    with SessionLocal() as session:
        rows = (
            session.query(ShelfAccessRequest, Shelf)
            .join(Shelf, ShelfAccessRequest.shelf_id == Shelf.id)
            .filter(
                ShelfAccessRequest.target_username == username,
                ShelfAccessRequest.request_type == "invite",
            )
            .order_by(ShelfAccessRequest.created_at.asc())
            .all()
        )
        result = []
        for req, shelf in rows:
            result.append({
                "id": req.id,
                "shelf_id": req.shelf_id,
                "shelf_name": shelf.name,
                "owner_username": shelf.owner_username,
                "created_at": req.created_at.strftime("%Y-%m-%d") if req.created_at else "",
            })
        return result


def get_user_pending_requests(username: str) -> list[int]:
    """Shelf IDs where user has a pending join request."""
    with SessionLocal() as session:
        reqs = session.query(ShelfAccessRequest).filter_by(
            target_username=username, request_type="request"
        ).all()
        return [r.shelf_id for r in reqs]


def get_user_pending_requests_detailed(username: str) -> list[dict]:
    """Join requests user has sent, with shelf details."""
    with SessionLocal() as session:
        rows = (
            session.query(ShelfAccessRequest, Shelf)
            .join(Shelf, ShelfAccessRequest.shelf_id == Shelf.id)
            .filter(
                ShelfAccessRequest.target_username == username,
                ShelfAccessRequest.request_type == "request",
            )
            .order_by(ShelfAccessRequest.created_at.asc())
            .all()
        )
        result = []
        for req, shelf in rows:
            result.append({
                "id": req.id,
                "shelf_id": req.shelf_id,
                "shelf_name": shelf.name,
                "owner_username": shelf.owner_username,
                "created_at": req.created_at.strftime("%Y-%m-%d") if req.created_at else "",
            })
        return result


def delete_access_request(req_id: int) -> bool:
    with SessionLocal() as session:
        req = session.query(ShelfAccessRequest).filter_by(id=req_id).first()
        if not req:
            return False
        session.delete(req)
        session.commit()
        return True
