"""Authentication service for user management and JWT handling."""
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt
from sqlalchemy.orm import Session as DbSession

from api.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    SECRET_KEY,
    SESSION_EXTEND_MINUTES,
)
from api.models.db.user import Session, User


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"), hashed_password.encode("utf-8")
    )


def create_access_token(user_id: int, jti: str | None = None) -> tuple[str, str]:
    """Create a JWT access token.

    Returns:
        Tuple of (token, jti)
    """
    if jti is None:
        jti = str(uuid.uuid4())

    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {
        "sub": str(user_id),
        "exp": expire,
        "jti": jti,
    }
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt, jti


def verify_token(token: str) -> dict | None:
    """Verify and decode a JWT token.

    Returns:
        Decoded token payload or None if invalid.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def get_user_by_username(db: DbSession, username: str) -> User | None:
    """Get user by username."""
    return db.query(User).filter(User.username == username).first()


def get_user_by_email(db: DbSession, email: str) -> User | None:
    """Get user by email."""
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: DbSession, user_id: int) -> User | None:
    """Get user by ID."""
    return db.query(User).filter(User.id == user_id).first()


def create_user(db: DbSession, username: str, email: str, password: str) -> User:
    """Create a new user."""
    hashed = hash_password(password)
    user = User(
        username=username,
        email=email,
        hashed_password=hashed,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_session(
    db: DbSession, user_id: int, token_jti: str, expires_at: datetime
) -> Session:
    """Create a new session for user."""
    session = Session(
        user_id=user_id,
        token_jti=token_jti,
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_active_session(db: DbSession, token_jti: str) -> Session | None:
    """Get an active session by token JTI."""
    now = datetime.now(timezone.utc)
    return (
        db.query(Session)
        .filter(
            Session.token_jti == token_jti,
            Session.is_active == True,  # noqa: E712
            Session.expires_at > now,
        )
        .first()
    )


def extend_session(db: DbSession, session: Session) -> Session:
    """Extend session expiration and update last activity."""
    now = datetime.now(timezone.utc)
    session.last_activity = now
    session.expires_at = now + timedelta(minutes=SESSION_EXTEND_MINUTES)
    db.commit()
    db.refresh(session)
    return session


def invalidate_session(db: DbSession, token_jti: str) -> None:
    """Invalidate a session by token JTI."""
    session = db.query(Session).filter(Session.token_jti == token_jti).first()
    if session:
        session.is_active = False
        db.commit()


def invalidate_all_user_sessions(db: DbSession, user_id: int) -> int:
    """Invalidate all sessions for a user."""
    result = (
        db.query(Session)
        .filter(Session.user_id == user_id, Session.is_active == True)  # noqa: E712
        .update({Session.is_active: False})
    )
    db.commit()
    return result


def cleanup_expired_sessions(db: DbSession) -> int:
    """Remove expired sessions from database."""
    now = datetime.now(timezone.utc)
    result = db.query(Session).filter(Session.expires_at < now).delete()
    db.commit()
    return result
