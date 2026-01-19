"""Pydantic models for authentication."""
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    """User registration request."""

    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=100)


class UserLogin(BaseModel):
    """User login request."""

    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    """JWT token response."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserResponse(BaseModel):
    """User response (public info)."""

    id: int
    username: str
    email: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class RefreshTokenRequest(BaseModel):
    """Refresh token request."""

    refresh_token: str


class MessageResponse(BaseModel):
    """Simple message response."""

    message: str


class ProfileResponse(BaseModel):
    """User profile response."""

    id: int
    username: str
    email: str
    display_name: str | None
    avatar_url: str | None
    avatar_size: int | None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ProfileUpdateRequest(BaseModel):
    """Profile update request."""

    display_name: str | None = Field(None, max_length=100)


class AvatarUploadResponse(BaseModel):
    """Avatar upload response."""

    avatar_url: str
    avatar_size: int
