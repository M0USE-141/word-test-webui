"""Attempt-related Pydantic models."""
from pydantic import BaseModel, Field


class AttemptEventPayload(BaseModel):
    """Model for attempt event."""

    attemptId: str | None = None
    testId: str = Field(..., min_length=1)
    clientId: str = Field(..., min_length=1)
    ts: str = Field(..., min_length=1)
    timezone: str = Field(..., min_length=1)
    settings: dict[str, object]
    questionId: int | None = None
    questionIndex: int | None = None
    answerId: int | str | None = None
    isCorrect: bool | None = None
    durationMs: int | None = None
    isSkipped: bool | None = None
    eventType: str = Field(..., min_length=1)


class AttemptFinalizeRequest(BaseModel):
    """Model for finalizing an attempt."""

    attemptId: str | None = None
    testId: str = Field(..., min_length=1)
    clientId: str = Field(..., min_length=1)
    ts: str = Field(..., min_length=1)
    timezone: str = Field(..., min_length=1)
    settings: dict[str, object]
    aggregates: dict[str, object] | None = None
    summary: dict[str, object] | None = None


class AttemptFinalizeResponse(BaseModel):
    """Model for attempt finalization response."""

    status: str
    attempt: dict[str, object]
