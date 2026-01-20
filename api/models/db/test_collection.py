"""
Test Collection and Share models for access control.
"""

from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.database import Base

if TYPE_CHECKING:
    from api.models.db.change_request import ChangeRequest
    from api.models.db.user import User


class AccessLevel(str, enum.Enum):
    """Access level for test collections."""

    PRIVATE = "private"  # Only owner can view/edit/delete
    SHARED = "shared"  # Owner + shared users can view, only owner can edit
    PUBLIC = "public"  # Everyone can view, only owner can edit


class TestCollection(Base):
    """
    Links file-based tests to database users for ownership and access control.
    """

    __tablename__ = "test_collections"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    test_id: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    access_level: Mapped[str] = mapped_column(
        String(20), default=AccessLevel.PRIVATE.value, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    owner: Mapped["User"] = relationship("User", back_populates="owned_tests")
    shares: Mapped[list["TestShare"]] = relationship(
        "TestShare", back_populates="test_collection", cascade="all, delete-orphan"
    )
    change_requests: Mapped[list["ChangeRequest"]] = relationship(
        "ChangeRequest", back_populates="test_collection", cascade="all, delete-orphan"
    )


class TestShare(Base):
    """
    Tracks which users have shared access to a test collection.
    Only applicable when TestCollection.access_level == SHARED.
    """

    __tablename__ = "test_shares"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    test_collection_id: Mapped[int] = mapped_column(
        ForeignKey("test_collections.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    shared_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    shared_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("test_collection_id", "user_id", name="uq_test_user_share"),
    )

    # Relationships
    test_collection: Mapped["TestCollection"] = relationship(
        "TestCollection", back_populates="shares"
    )
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    shared_by_user: Mapped["User"] = relationship("User", foreign_keys=[shared_by])
