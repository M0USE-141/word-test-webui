"""Attempt management endpoints using SQLite database."""
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession

from api.database import get_db
from api.dependencies.auth import get_optional_user
from api.models.db.user import User
from api.services.attempt_service import (
    start_attempt,
    record_answer,
    skip_question,
    finish_attempt,
    abandon_attempt,
    get_attempt,
)
from api.utils import validate_id, validate_test_exists


router = APIRouter(prefix="/api/attempts", tags=["attempts"])


class StartAttemptRequest(BaseModel):
    """Request to start a new attempt."""
    attemptId: str = Field(..., min_length=1)
    testId: str = Field(..., min_length=1)
    clientId: str = Field(..., min_length=1)
    settings: dict[str, Any] | None = None
    questions: list[dict[str, Any]] | None = None


class RecordAnswerRequest(BaseModel):
    """Request to record an answer."""
    testId: str = Field(..., min_length=1)
    clientId: str = Field(..., min_length=1)
    questionId: int
    answerIndex: int | None = None
    isCorrect: bool | None = None
    durationMs: int = 0
    isSkipped: bool = False


class FinishAttemptRequest(BaseModel):
    """Request to finish an attempt."""
    testId: str = Field(..., min_length=1)
    clientId: str = Field(..., min_length=1)
    totalDurationMs: int = 0


@router.post("/start")
def start_new_attempt(
    payload: StartAttemptRequest,
    db: Annotated[DbSession, Depends(get_db)],
    current_user: Annotated[User | None, Depends(get_optional_user)] = None,
) -> dict[str, Any]:
    """
    Start a new test attempt.

    Creates the attempt record and stores question snapshots for later preview.
    """
    attempt_id = validate_id("attemptId", payload.attemptId)
    test_id = validate_id("testId", payload.testId)
    client_id = validate_id("clientId", payload.clientId)
    validate_test_exists(test_id)

    user_id = current_user.id if current_user else None

    attempt = start_attempt(
        db=db,
        attempt_id=attempt_id,
        test_id=test_id,
        client_id=client_id,
        user_id=user_id,
        settings=payload.settings,
        questions=payload.questions,
    )

    return {
        "status": "started",
        "attemptId": attempt.id,
        "testId": attempt.test_id,
        "questionCount": attempt.question_count,
    }


@router.post("/{attempt_id}/answer")
def record_attempt_answer(
    attempt_id: str,
    payload: RecordAnswerRequest,
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, Any]:
    """
    Record an answer for a question in the attempt.
    """
    attempt_id = validate_id("attemptId", attempt_id)
    test_id = validate_id("testId", payload.testId)
    client_id = validate_id("clientId", payload.clientId)

    # Validate attempt exists and matches
    attempt = get_attempt(db, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.test_id != test_id:
        raise HTTPException(status_code=400, detail="Mismatched testId")
    if attempt.client_id != client_id:
        raise HTTPException(status_code=400, detail="Mismatched clientId")

    if payload.isSkipped:
        answer = skip_question(
            db=db,
            attempt_id=attempt_id,
            question_id=payload.questionId,
            duration_ms=payload.durationMs,
        )
    else:
        answer = record_answer(
            db=db,
            attempt_id=attempt_id,
            question_id=payload.questionId,
            answer_index=payload.answerIndex,
            is_correct=payload.isCorrect,
            duration_ms=payload.durationMs,
        )

    return {
        "status": "recorded",
        "attemptId": attempt_id,
        "questionId": answer.question_id,
        "isCorrect": answer.is_correct,
    }


@router.post("/{attempt_id}/finish")
def finish_test_attempt(
    attempt_id: str,
    payload: FinishAttemptRequest,
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, Any]:
    """
    Finish an attempt and calculate final statistics.
    """
    attempt_id = validate_id("attemptId", attempt_id)
    test_id = validate_id("testId", payload.testId)
    client_id = validate_id("clientId", payload.clientId)

    # Validate attempt exists and matches
    attempt = get_attempt(db, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.test_id != test_id:
        raise HTTPException(status_code=400, detail="Mismatched testId")
    if attempt.client_id != client_id:
        raise HTTPException(status_code=400, detail="Mismatched clientId")

    attempt = finish_attempt(
        db=db,
        attempt_id=attempt_id,
        total_duration_ms=payload.totalDurationMs,
    )

    return {
        "status": "finished",
        "attemptId": attempt.id,
        "questionCount": attempt.question_count,
        "answeredCount": attempt.answered_count,
        "correctCount": attempt.correct_count,
        "percentCorrect": attempt.percent_correct,
        "totalDurationMs": attempt.total_duration_ms,
    }


@router.post("/{attempt_id}/abandon")
def abandon_test_attempt(
    attempt_id: str,
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, Any]:
    """
    Mark an attempt as abandoned (user left without finishing).
    """
    attempt_id = validate_id("attemptId", attempt_id)

    attempt = abandon_attempt(db, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    return {
        "status": "abandoned",
        "attemptId": attempt.id,
    }


@router.get("/{attempt_id}")
def get_attempt_details(
    attempt_id: str,
    client_id: str,
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, Any]:
    """
    Get details for a specific attempt.
    """
    attempt_id = validate_id("attemptId", attempt_id)
    client_id = validate_id("clientId", client_id)

    attempt = get_attempt(db, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.client_id != client_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Format answers for response
    answers = []
    for answer in sorted(attempt.answers, key=lambda a: a.question_index):
        answers.append({
            "questionId": answer.question_id,
            "questionIndex": answer.question_index,
            "answerIndex": answer.answer_index,
            "isCorrect": answer.is_correct,
            "isSkipped": answer.is_skipped,
            "durationMs": answer.duration_ms,
        })

    return {
        "attemptId": attempt.id,
        "testId": attempt.test_id,
        "clientId": attempt.client_id,
        "userId": attempt.user_id,
        "status": attempt.status,
        "startedAt": attempt.started_at.isoformat() if attempt.started_at else None,
        "finishedAt": attempt.finished_at.isoformat() if attempt.finished_at else None,
        "questionCount": attempt.question_count,
        "answeredCount": attempt.answered_count,
        "correctCount": attempt.correct_count,
        "percentCorrect": attempt.percent_correct,
        "totalDurationMs": attempt.total_duration_ms,
        "settings": attempt.settings,
        "answers": answers,
    }
