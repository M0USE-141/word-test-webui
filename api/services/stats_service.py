"""Service layer for statistics using SQLite database."""
from datetime import datetime
from typing import Any

from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session as DBSession

from api.models.db.attempt import Attempt, AttemptAnswer, AttemptStatus


def get_attempt_stats(db: DBSession, attempt_id: str) -> dict[str, Any] | None:
    """
    Get statistics for a single attempt.
    Returns formatted statistics dict or None if attempt not found.
    """
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        return None

    # Get answers for per-question data
    answers = list(
        db.execute(
            select(AttemptAnswer)
            .where(AttemptAnswer.attempt_id == attempt_id)
            .order_by(AttemptAnswer.question_index)
        ).scalars().all()
    )

    return format_attempt_stats(attempt, answers)


def format_attempt_stats(
    attempt: Attempt,
    answers: list[AttemptAnswer] | None = None,
) -> dict[str, Any]:
    """Format attempt into statistics dict."""
    question_count = attempt.question_count or 0
    answered_count = attempt.answered_count or 0
    correct_count = attempt.correct_count or 0
    incorrect_count = answered_count - correct_count
    skipped_count = question_count - answered_count

    # Calculate percentages
    percent_correct = (correct_count / question_count * 100) if question_count else 0
    percent_incorrect = (incorrect_count / question_count * 100) if question_count else 0
    percent_unanswered = (skipped_count / question_count * 100) if question_count else 0

    # Accuracy = correct / answered (how accurate the given answers were)
    accuracy = (correct_count / answered_count * 100) if answered_count else 0

    # Answer rate = answered / total
    answer_rate = (answered_count / question_count * 100) if question_count else 0

    # Average time per question
    avg_time = 0
    if answers:
        total_duration = sum(a.duration_ms for a in answers if a.duration_ms)
        avg_time = total_duration / len(answers) if answers else 0

    # Build per-question data
    per_question = []
    if answers:
        for answer in answers:
            per_question.append({
                "questionId": answer.question_id,
                "index": answer.question_index,
                "isCorrect": answer.is_correct,
                "isSkipped": answer.is_skipped,
                "durationMs": answer.duration_ms,
                "answerIndex": answer.answer_index,
                # Question snapshot for preview
                "questionText": answer.question_text,
                "options": answer.options,
                "correctOptionIndex": answer.correct_option_index,
            })

    return {
        "attemptId": attempt.id,
        "testId": attempt.test_id,
        "clientId": attempt.client_id,
        "userId": attempt.user_id,
        "status": attempt.status,
        "startedAt": attempt.started_at.isoformat() if attempt.started_at else None,
        "finishedAt": attempt.finished_at.isoformat() if attempt.finished_at else None,
        "totalDurationMs": attempt.total_duration_ms,
        "questionCount": question_count,
        "answeredCount": answered_count,
        "correctCount": correct_count,
        "incorrectCount": incorrect_count,
        "skippedCount": skipped_count,
        "percentCorrect": round(percent_correct, 1),
        "percentIncorrect": round(percent_incorrect, 1),
        "percentUnanswered": round(percent_unanswered, 1),
        "accuracy": round(accuracy, 1),
        "answerRate": round(answer_rate, 1),
        "avgTimePerQuestion": round(avg_time, 0),
        "settings": attempt.settings,
        "perQuestion": per_question,
    }


def get_attempts_list(
    db: DBSession,
    client_id: str | None = None,
    user_id: int | None = None,
    test_id: str | None = None,
    status: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """
    Get list of attempts with basic stats (for attempt list view).
    Returns tuple of (attempts_list, total_count).
    """
    # Build base query
    query = select(Attempt)
    count_query = select(func.count(Attempt.id))

    # Apply filters
    conditions = []
    if client_id:
        conditions.append(Attempt.client_id == client_id)
    if user_id:
        conditions.append(Attempt.user_id == user_id)
    if test_id:
        conditions.append(Attempt.test_id == test_id)
    if status:
        conditions.append(Attempt.status == status)
    if start_date:
        conditions.append(Attempt.started_at >= start_date)
    if end_date:
        conditions.append(Attempt.started_at <= end_date)

    if conditions:
        query = query.where(and_(*conditions))
        count_query = count_query.where(and_(*conditions))

    # Get total count
    total = db.execute(count_query).scalar() or 0

    # Get paginated results
    query = query.order_by(Attempt.started_at.desc()).limit(limit).offset(offset)
    attempts = list(db.execute(query).scalars().all())

    # Format results (without per-question data for list view)
    results = []
    for attempt in attempts:
        results.append({
            "attemptId": attempt.id,
            "testId": attempt.test_id,
            "clientId": attempt.client_id,
            "userId": attempt.user_id,
            "status": attempt.status,
            "startedAt": attempt.started_at.isoformat() if attempt.started_at else None,
            "finishedAt": attempt.finished_at.isoformat() if attempt.finished_at else None,
            "totalDurationMs": attempt.total_duration_ms,
            "questionCount": attempt.question_count,
            "answeredCount": attempt.answered_count,
            "correctCount": attempt.correct_count,
            "percentCorrect": attempt.percent_correct,
        })

    return results, total


def get_aggregate_stats(
    db: DBSession,
    client_id: str | None = None,
    user_id: int | None = None,
    test_id: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> dict[str, Any]:
    """
    Calculate aggregate statistics across multiple attempts.
    """
    # Build base query for completed attempts only
    query = select(Attempt).where(Attempt.status == AttemptStatus.COMPLETED.value)

    # Apply filters
    conditions = []
    if client_id:
        conditions.append(Attempt.client_id == client_id)
    if user_id:
        conditions.append(Attempt.user_id == user_id)
    if test_id:
        conditions.append(Attempt.test_id == test_id)
    if start_date:
        conditions.append(Attempt.started_at >= start_date)
    if end_date:
        conditions.append(Attempt.started_at <= end_date)

    if conditions:
        query = query.where(and_(*conditions))

    attempts = list(db.execute(query).scalars().all())

    if not attempts:
        return {
            "attemptCount": 0,
            "totalQuestions": 0,
            "totalAnswered": 0,
            "totalCorrect": 0,
            "avgPercentCorrect": 0,
            "avgTimePerQuestion": 0,
            "totalDurationMs": 0,
        }

    # Calculate aggregates
    total_questions = sum(a.question_count for a in attempts)
    total_answered = sum(a.answered_count for a in attempts)
    total_correct = sum(a.correct_count for a in attempts)
    total_duration = sum(a.total_duration_ms for a in attempts)

    # Average percent correct across attempts
    percents = [a.percent_correct for a in attempts]
    avg_percent = sum(percents) / len(percents) if percents else 0

    # Average time per question (across all answers)
    avg_time = total_duration / total_questions if total_questions else 0

    return {
        "attemptCount": len(attempts),
        "totalQuestions": total_questions,
        "totalAnswered": total_answered,
        "totalCorrect": total_correct,
        "avgPercentCorrect": round(avg_percent, 1),
        "avgTimePerQuestion": round(avg_time, 0),
        "totalDurationMs": total_duration,
    }


def get_test_owner_stats(
    db: DBSession,
    test_id: str,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    """
    Get statistics for a test (for test owners).
    Shows all users who attempted the test.
    """
    # Build query
    query = select(Attempt).where(
        Attempt.test_id == test_id,
        Attempt.status == AttemptStatus.COMPLETED.value,
    )
    count_query = select(func.count(Attempt.id)).where(
        Attempt.test_id == test_id,
        Attempt.status == AttemptStatus.COMPLETED.value,
    )

    if start_date:
        query = query.where(Attempt.started_at >= start_date)
        count_query = count_query.where(Attempt.started_at >= start_date)
    if end_date:
        query = query.where(Attempt.started_at <= end_date)
        count_query = count_query.where(Attempt.started_at <= end_date)

    total = db.execute(count_query).scalar() or 0

    query = query.order_by(Attempt.started_at.desc()).limit(limit).offset(offset)
    attempts = list(db.execute(query).scalars().all())

    # Calculate overall stats
    if attempts:
        total_correct = sum(a.correct_count for a in attempts)
        total_questions = sum(a.question_count for a in attempts)
        avg_percent = sum(a.percent_correct for a in attempts) / len(attempts)
    else:
        total_correct = 0
        total_questions = 0
        avg_percent = 0

    # Format attempt list
    attempt_list = []
    for attempt in attempts:
        attempt_list.append({
            "attemptId": attempt.id,
            "userId": attempt.user_id,
            "clientId": attempt.client_id,
            "startedAt": attempt.started_at.isoformat() if attempt.started_at else None,
            "finishedAt": attempt.finished_at.isoformat() if attempt.finished_at else None,
            "questionCount": attempt.question_count,
            "correctCount": attempt.correct_count,
            "percentCorrect": attempt.percent_correct,
            "totalDurationMs": attempt.total_duration_ms,
        })

    return {
        "testId": test_id,
        "totalAttempts": total,
        "totalCorrect": total_correct,
        "totalQuestions": total_questions,
        "avgPercentCorrect": round(avg_percent, 1),
        "attempts": attempt_list,
    }
