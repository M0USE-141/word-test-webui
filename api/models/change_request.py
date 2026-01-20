"""Pydantic models for change request API."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel


class ChangeRequestType(str, Enum):
    """Type of change request."""

    ADD_QUESTION = "add_question"
    EDIT_QUESTION = "edit_question"
    DELETE_QUESTION = "delete_question"
    EDIT_SETTINGS = "edit_settings"


class ChangeRequestStatus(str, Enum):
    """Status of change request."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


# Request models


class ChangeRequestCreate(BaseModel):
    """Request to create a change request."""

    request_type: ChangeRequestType
    question_id: str | None = None
    payload: dict[str, Any]


class ChangeRequestReview(BaseModel):
    """Request to review (approve/reject) a change request."""

    comment: str | None = None


# Response models


class ChangeRequestResponse(BaseModel):
    """Response with change request information."""

    id: int
    test_id: str
    user_id: int
    username: str
    request_type: ChangeRequestType
    question_id: str | None
    payload: dict[str, Any]
    status: ChangeRequestStatus
    created_at: datetime
    reviewed_at: datetime | None = None
    reviewed_by: int | None = None
    reviewer_username: str | None = None
    review_comment: str | None = None

    class Config:
        from_attributes = True


class ChangeRequestListResponse(BaseModel):
    """Response with a list of change requests."""

    items: list[ChangeRequestResponse]
    total: int
    pending_count: int


class ChangeRequestStats(BaseModel):
    """Statistics for change requests."""

    pending: int
    approved: int
    rejected: int
    total: int


class CanProposeResponse(BaseModel):
    """Response for can-propose endpoint."""

    can_propose: bool
    is_owner: bool
    reason: str | None = None
