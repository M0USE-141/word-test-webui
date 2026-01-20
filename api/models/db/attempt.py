"""
Attempt and AttemptAnswer database models for test attempt metrics.
"""

from __future__ import annotations

import enum
import json
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.database import Base

if TYPE_CHECKING:
    from api.models.db.user import User


class AttemptStatus(str, enum.Enum):
    """Status of a test attempt."""

    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


class Attempt(Base):
    """
    Test attempt record.
    Stores metadata about a single test-taking session.
    """

    __tablename__ = "attempts"

    # Primary key - UUID string from frontend
    id: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)

    # References
    test_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    client_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)

    # Timing
    started_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )
    total_duration_ms: Mapped[int] = mapped_column(default=0, nullable=False)

    # Status and results
    status: Mapped[str] = mapped_column(
        String(20), default=AttemptStatus.IN_PROGRESS.value, nullable=False
    )
    question_count: Mapped[int] = mapped_column(default=0, nullable=False)
    answered_count: Mapped[int] = mapped_column(default=0, nullable=False)
    correct_count: Mapped[int] = mapped_column(default=0, nullable=False)

    # Settings snapshot (stored as JSON string)
    settings_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    user: Mapped["User | None"] = relationship("User", foreign_keys=[user_id])
    answers: Mapped[list["AttemptAnswer"]] = relationship(
        "AttemptAnswer", back_populates="attempt", cascade="all, delete-orphan"
    )

    @property
    def settings(self) -> dict[str, Any]:
        """Parse settings from JSON."""
        if not self.settings_json:
            return {}
        try:
            return json.loads(self.settings_json)
        except (json.JSONDecodeError, TypeError):
            return {}

    @settings.setter
    def settings(self, value: dict[str, Any]) -> None:
        """Serialize settings to JSON."""
        self.settings_json = json.dumps(value) if value else None

    @property
    def percent_correct(self) -> float:
        """Calculate percentage of correct answers."""
        if self.question_count == 0:
            return 0.0
        return (self.correct_count / self.question_count) * 100

    @property
    def is_completed(self) -> bool:
        """Check if attempt is completed."""
        return self.status == AttemptStatus.COMPLETED.value


class AttemptAnswer(Base):
    """
    Individual answer record within an attempt.
    Stores the response to a single question with snapshot data for preview.
    """

    __tablename__ = "attempt_answers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    attempt_id: Mapped[str] = mapped_column(
        ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Question reference
    question_id: Mapped[int] = mapped_column(nullable=False)
    question_index: Mapped[int] = mapped_column(nullable=False)  # Order shown in attempt

    # Answer data
    answer_index: Mapped[int | None] = mapped_column(nullable=True)  # Selected option index
    is_correct: Mapped[bool | None] = mapped_column(nullable=True)
    is_skipped: Mapped[bool] = mapped_column(default=False, nullable=False)
    duration_ms: Mapped[int] = mapped_column(default=0, nullable=False)
    answered_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )

    # Question snapshot for preview (stored as JSON)
    question_text_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    options_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    correct_option_index: Mapped[int | None] = mapped_column(nullable=True)

    # Constraints
    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_attempt_question"),
    )

    # Relationships
    attempt: Mapped["Attempt"] = relationship("Attempt", back_populates="answers")

    @property
    def question_text(self) -> dict[str, Any] | None:
        """Parse question text from JSON."""
        if not self.question_text_json:
            return None
        try:
            return json.loads(self.question_text_json)
        except (json.JSONDecodeError, TypeError):
            return None

    @question_text.setter
    def question_text(self, value: dict[str, Any] | None) -> None:
        """Serialize question text to JSON."""
        self.question_text_json = json.dumps(value) if value else None

    @property
    def options(self) -> list[dict[str, Any]]:
        """Parse options from JSON."""
        if not self.options_json:
            return []
        try:
            return json.loads(self.options_json)
        except (json.JSONDecodeError, TypeError):
            return []

    @options.setter
    def options(self, value: list[dict[str, Any]] | None) -> None:
        """Serialize options to JSON."""
        self.options_json = json.dumps(value) if value else None
