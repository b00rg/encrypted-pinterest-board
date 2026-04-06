from datetime import datetime

from .base import SessionLocal
from .models import GroupKey, User


def create_user(username: str,
                password_hash: str,
                private_key_pem: bytes,
                certificate_pem: bytes,
                is_admin: bool = False) -> User:
    with SessionLocal() as session:
        user = User(
            username=username,
            password_hash=password_hash,
            private_key=private_key_pem,
            certificate=certificate_pem,
            is_admin=is_admin,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        session.expunge(user)
        return user


def get_user(username: str) -> User | None:
    with SessionLocal() as session:
        user = session.query(User).filter_by(username=username).first()
        if user:
            session.expunge(user)
        return user


def get_all_users() -> list[User]:
    with SessionLocal() as session:
        users = session.query(User).all()
        session.expunge_all()
        return users


def delete_user(username: str) -> bool:
    with SessionLocal() as session:
        user = session.query(User).filter_by(username=username).first()
        if not user:
            return False
        session.query(GroupKey).filter_by(username=username).delete()
        session.delete(user)
        session.commit()
        return True


def save_wrapped_key(username: str, wrapped_key: bytes, version: int = 1):
    with SessionLocal() as session:
        existing = session.query(GroupKey).filter_by(username=username).first()
        if existing:
            existing.wrapped_key = wrapped_key
            existing.version = version
            existing.updated_at = datetime.now()
        else:
            session.add(GroupKey(
                username=username,
                wrapped_key=wrapped_key,
                version=version,
                updated_at=datetime.now(),
            ))
        session.commit()


def get_wrapped_key(username: str) -> bytes | None:
    with SessionLocal() as session:
        row = session.query(GroupKey).filter_by(username=username).first()
        return row.wrapped_key if row else None


def get_current_key_version(username: str) -> int:
    with SessionLocal() as session:
        row = session.query(GroupKey).filter_by(username=username).first()
        return row.version if row else 0


def get_all_member_certificates() -> list[bytes]:
    with SessionLocal() as session:
        members = (
            session.query(User)
            .join(GroupKey, User.username == GroupKey.username)
            .all()
        )
        return [m.certificate for m in members]
