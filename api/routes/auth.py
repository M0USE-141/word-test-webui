"""Authentication routes."""
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session as DbSession

from api.config import ACCESS_TOKEN_EXPIRE_MINUTES
from api.database import get_db
from api.dependencies.auth import get_current_user
from api.models.auth import (
    MessageResponse,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)
from api.models.db.user import User
from api.services.auth_service import (
    create_access_token,
    create_session,
    create_user,
    get_user_by_email,
    get_user_by_username,
    invalidate_session,
    verify_password,
    verify_token,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: UserRegister,
    db: Annotated[DbSession, Depends(get_db)],
) -> User:
    """Register a new user."""
    # Check if username already exists
    if get_user_by_username(db, data.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered",
        )

    # Check if email already exists
    if get_user_by_email(db, data.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Create user
    user = create_user(db, data.username, data.email, data.password)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    data: UserLogin,
    db: Annotated[DbSession, Depends(get_db)],
) -> TokenResponse:
    """Login and get JWT token."""
    # Try to find user by username
    user = get_user_by_username(db, data.username)

    # If not found by username, try email
    if user is None:
        user = get_user_by_email(db, data.username)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is inactive",
        )

    # Verify password
    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    # Create token and session
    token, jti = create_access_token(user.id)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    create_session(db, user.id, jti, expires_at)

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[DbSession, Depends(get_db)],
) -> MessageResponse:
    """Logout and invalidate current session."""
    if credentials is None:
        return MessageResponse(message="Already logged out")

    token = credentials.credentials
    payload = verify_token(token)

    if payload and payload.get("jti"):
        invalidate_session(db, payload["jti"])

    return MessageResponse(message="Logged out successfully")


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Get current user info."""
    return current_user


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[DbSession, Depends(get_db)],
) -> TokenResponse:
    """Refresh access token."""
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

    user_id = payload.get("sub")
    old_jti = payload.get("jti")

    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    # Invalidate old session if exists
    if old_jti:
        invalidate_session(db, old_jti)

    # Create new token and session
    new_token, new_jti = create_access_token(int(user_id))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    create_session(db, int(user_id), new_jti, expires_at)

    return TokenResponse(
        access_token=new_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
