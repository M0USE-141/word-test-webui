"""Service layer for attempts using SQLite database."""
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session as DBSession, joinedload

from api.models.db.attempt import Attempt, AttemptAnswer, AttemptStatus


def get_or_create_attempt(
    db: DBSession,
    attempt_id: str,
    test_id: str,
    client_id: str,
    user_id: int | None = None,
    settings: dict[str, Any] | None = None,
) -> Attempt:
    """
    Get existing attempt or create a new one.
    Validates that test_id and client_id match for existing attempts.
    """
    attempt = db.get(Attempt, attempt_id)

    if attempt:
        # Validate existing attempt matches
        if attempt.test_id != test_id:
            raise HTTPException(status_code=400, detail="Mismatched testId")
        if attempt.client_id != client_id:
            raise HTTPException(status_code=400, detail="Mismatched clientId")
        return attempt

    # Create new attempt
    attempt = Attempt(
        id=attempt_id,
        test_id=test_id,
        client_id=client_id,
        user_id=user_id,
        status=AttemptStatus.IN_PROGRESS.value,
    )
    if settings:
        attempt.settings = settings

    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt


def start_attempt(
    db: DBSession,
    attempt_id: str,
    test_id: str,
    client_id: str,
    user_id: int | None = None,
    settings: dict[str, Any] | None = None,
    questions: list[dict[str, Any]] | None = None,
) -> Attempt:
    """
    Start a new attempt with question snapshots.

    Args:
        db: Database session
        attempt_id: Unique attempt identifier
        test_id: Test being attempted
        client_id: Client identifier (for anonymous users)
        user_id: Optional authenticated user ID
        settings: Attempt settings (question count, randomization, etc.)
        questions: List of questions in the attempt (from session)
    """
    attempt = get_or_create_attempt(
        db, attempt_id, test_id, client_id, user_id, settings
    )

    # Store question snapshots
    if questions:
        attempt.question_count = len(questions)

        for index, q_data in enumerate(questions):
            question_id = q_data.get("questionId")
            if not isinstance(question_id, int):
                continue

            # Check if answer already exists
            existing = db.execute(
                select(AttemptAnswer).where(
                    AttemptAnswer.attempt_id == attempt_id,
                    AttemptAnswer.question_id == question_id,
                )
            ).scalar_one_or_none()

            if existing:
                continue

            # Get question data from session format
            q_obj = q_data.get("question", {})

            answer = AttemptAnswer(
                attempt_id=attempt_id,
                question_id=question_id,
                question_index=index,
                is_skipped=True,  # Default to skipped until answered
            )

            # Store question snapshot for preview
            if isinstance(q_obj, dict):
                answer.question_text = q_obj.get("question")
                answer.options = q_obj.get("options", [])

                # Find correct option index
                correct_opt = q_obj.get("correct")
                options = q_obj.get("options", [])
                if correct_opt and options:
                    for idx, opt in enumerate(options):
                        if opt == correct_opt or (
                            isinstance(opt, dict)
                            and isinstance(correct_opt, dict)
                            and opt.get("isCorrect")
                        ):
                            answer.correct_option_index = idx
                            break

            db.add(answer)

        db.commit()
        db.refresh(attempt)

    return attempt


def record_answer(
    db: DBSession,
    attempt_id: str,
    question_id: int,
    answer_index: int | None,
    is_correct: bool | None,
    duration_ms: int = 0,
    is_skipped: bool = False,
) -> AttemptAnswer:
    """
    Record or update an answer for a question in an attempt.
    """
    # Get or create answer record
    answer = db.execute(
        select(AttemptAnswer).where(
            AttemptAnswer.attempt_id == attempt_id,
            AttemptAnswer.question_id == question_id,
        )
    ).scalar_one_or_none()

    if not answer:
        # This shouldn't happen normally - answers are pre-created in start_attempt
        # But handle gracefully for backwards compatibility
        answer = AttemptAnswer(
            attempt_id=attempt_id,
            question_id=question_id,
            question_index=0,  # Unknown index
        )
        db.add(answer)

    # Update answer data
    answer.answer_index = answer_index
    answer.is_correct = is_correct
    answer.is_skipped = is_skipped
    answer.duration_ms = duration_ms
    answer.answered_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(answer)
    return answer


def skip_question(
    db: DBSession,
    attempt_id: str,
    question_id: int,
    duration_ms: int = 0,
) -> AttemptAnswer:
    """Mark a question as skipped."""
    return record_answer(
        db,
        attempt_id,
        question_id,
        answer_index=None,
        is_correct=None,
        duration_ms=duration_ms,
        is_skipped=True,
    )


def finish_attempt(
    db: DBSession,
    attempt_id: str,
    total_duration_ms: int = 0,
) -> Attempt:
    """
    Finish an attempt and calculate final statistics.
    """
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    # Calculate final statistics from answers
    answers = db.execute(
        select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt_id)
    ).scalars().all()

    answered_count = 0
    correct_count = 0

    for answer in answers:
        if not answer.is_skipped and answer.answer_index is not None:
            answered_count += 1
            if answer.is_correct:
                correct_count += 1

    # Update attempt
    attempt.status = AttemptStatus.COMPLETED.value
    attempt.finished_at = datetime.now(timezone.utc)
    attempt.total_duration_ms = total_duration_ms
    attempt.answered_count = answered_count
    attempt.correct_count = correct_count

    db.commit()
    db.refresh(attempt)
    return attempt


def abandon_attempt(db: DBSession, attempt_id: str) -> Attempt | None:
    """Mark an attempt as abandoned."""
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        return None

    attempt.status = AttemptStatus.ABANDONED.value
    db.commit()
    db.refresh(attempt)
    return attempt


def get_attempt(db: DBSession, attempt_id: str) -> Attempt | None:
    """Get attempt by ID with answers loaded."""
    return db.execute(
        select(Attempt)
        .options(joinedload(Attempt.answers))
        .where(Attempt.id == attempt_id)
    ).unique().scalar_one_or_none()


def get_attempts_by_client(
    db: DBSession,
    client_id: str,
    test_id: str | None = None,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Attempt]:
    """
    Get attempts for a client, optionally filtered by test_id and status.
    """
    query = select(Attempt).where(Attempt.client_id == client_id)

    if test_id:
        query = query.where(Attempt.test_id == test_id)
    if status:
        query = query.where(Attempt.status == status)

    query = query.order_by(Attempt.started_at.desc()).limit(limit).offset(offset)

    return list(db.execute(query).scalars().all())


def get_attempts_by_user(
    db: DBSession,
    user_id: int,
    test_id: str | None = None,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Attempt]:
    """
    Get attempts for a user, optionally filtered by test_id and status.
    """
    query = select(Attempt).where(Attempt.user_id == user_id)

    if test_id:
        query = query.where(Attempt.test_id == test_id)
    if status:
        query = query.where(Attempt.status == status)

    query = query.order_by(Attempt.started_at.desc()).limit(limit).offset(offset)

    return list(db.execute(query).scalars().all())


def get_attempts_by_test(
    db: DBSession,
    test_id: str,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Attempt]:
    """
    Get all attempts for a test (for owner statistics).
    """
    query = select(Attempt).where(Attempt.test_id == test_id)

    if status:
        query = query.where(Attempt.status == status)

    query = query.order_by(Attempt.started_at.desc()).limit(limit).offset(offset)

    return list(db.execute(query).scalars().all())


def count_attempts(
    db: DBSession,
    client_id: str | None = None,
    user_id: int | None = None,
    test_id: str | None = None,
    status: str | None = None,
) -> int:
    """Count attempts matching criteria."""
    query = select(func.count(Attempt.id))

    if client_id:
        query = query.where(Attempt.client_id == client_id)
    if user_id:
        query = query.where(Attempt.user_id == user_id)
    if test_id:
        query = query.where(Attempt.test_id == test_id)
    if status:
        query = query.where(Attempt.status == status)

    return db.execute(query).scalar() or 0


def get_attempt_answers(db: DBSession, attempt_id: str) -> list[AttemptAnswer]:
    """Get all answers for an attempt, ordered by question index."""
    return list(
        db.execute(
            select(AttemptAnswer)
            .where(AttemptAnswer.attempt_id == attempt_id)
            .order_by(AttemptAnswer.question_index)
        ).scalars().all()
    )


def delete_attempt(db: DBSession, attempt_id: str) -> bool:
    """Delete an attempt and all its answers."""
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        return False

    db.delete(attempt)
    db.commit()
    return True
