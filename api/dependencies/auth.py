"""Authentication dependencies for FastAPI."""
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session as DbSession

from api.database import get_db
from api.models.db.user import User
from api.services.auth_service import (
    extend_session,
    get_active_session,
    get_user_by_id,
    verify_token,
)

# HTTP Bearer scheme for JWT
security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[DbSession, Depends(get_db)],
) -> User:
    """Get the current authenticated user.

    Raises:
        HTTPException: 401 if not authenticated or token is invalid.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = verify_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if session is still active
    jti = payload.get("jti")
    if jti:
        session = get_active_session(db, jti)
        if session is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired or invalidated",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # Extend session on activity
        extend_session(db, session)

    # Get user
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = get_user_by_id(db, int(user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[DbSession, Depends(get_db)],
) -> User | None:
    """Get the current user if authenticated, otherwise None.

    This dependency does not raise an exception if not authenticated.
    """
    if credentials is None:
        return None

    token = credentials.credentials
    payload = verify_token(token)

    if payload is None:
        return None

    # Check if session is still active
    jti = payload.get("jti")
    if jti:
        session = get_active_session(db, jti)
        if session is None:
            return None
        # Extend session on activity
        extend_session(db, session)

    # Get user
    user_id = payload.get("sub")
    if user_id is None:
        return None

    user = get_user_by_id(db, int(user_id))
    if user is None or not user.is_active:
        return None

    return user
