"""
ChangeRequest model for test editing proposals.
"""

from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.database import Base

if TYPE_CHECKING:
    from api.models.db.test_collection import TestCollection
    from api.models.db.user import User


class ChangeRequestType(str, enum.Enum):
    """Type of change request."""

    ADD_QUESTION = "add_question"
    EDIT_QUESTION = "edit_question"
    DELETE_QUESTION = "delete_question"
    EDIT_SETTINGS = "edit_settings"


class ChangeRequestStatus(str, enum.Enum):
    """Status of change request."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ChangeRequest(Base):
    """
    Represents a proposed change to a test collection.
    Non-owners can propose changes, owners can approve/reject them.
    """

    __tablename__ = "change_requests"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    test_collection_id: Mapped[int] = mapped_column(
        ForeignKey("test_collections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    request_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )
    question_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    payload: Mapped[str] = mapped_column(
        Text, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), default=ChangeRequestStatus.PENDING.value, nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
    )
    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    review_comment: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )

    # Relationships
    test_collection: Mapped["TestCollection"] = relationship(
        "TestCollection", back_populates="change_requests"
    )
    user: Mapped["User"] = relationship(
        "User", foreign_keys=[user_id], back_populates="change_requests"
    )
    reviewer: Mapped["User | None"] = relationship(
        "User", foreign_keys=[reviewed_by]
    )
