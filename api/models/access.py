"""Pydantic models for access control API."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class AccessLevel(str, Enum):
    """Access level for test collections."""

    PRIVATE = "private"
    SHARED = "shared"
    PUBLIC = "public"


class AccessUpdateRequest(BaseModel):
    """Request to update test access level."""

    access_level: AccessLevel


class ShareRequest(BaseModel):
    """Request to share test with a user."""

    username: str


class ShareResponse(BaseModel):
    """Response with share information."""

    id: int
    user_id: int
    username: str
    email: str
    shared_at: datetime
    shared_by_username: str | None = None

    class Config:
        from_attributes = True


class TestAccessInfo(BaseModel):
    """Access information for a test."""

    owner_id: int
    owner_username: str
    access_level: AccessLevel
    is_owner: bool
    shares_count: int = 0

    class Config:
        from_attributes = True


class TestMetadataWithAccess(BaseModel):
    """Test metadata with access information."""

    id: str
    title: str
    questionCount: int
    owner_id: int
    owner_username: str
    access_level: AccessLevel
    is_owner: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
