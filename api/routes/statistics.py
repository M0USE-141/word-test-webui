"""Statistics endpoints."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session as DbSession

from api.database import get_db
from api.dependencies.auth import get_current_user
from api.models.db.user import User
from api.services import access_service
from api.utils import attempt_meta_path, utc_now, validate_id, validate_test_exists, write_json_file
from api.services.attempt_service import (
    load_attempt_events,
    load_attempt_meta,
)
from api.services.stats_service import (
    build_attempt_summary_from_events,
    load_attempt_index,
    load_attempt_stats,
    rebuild_attempt_index,
    write_attempt_stats_from_summary,
)
from api.services.test_service import load_test_payload

router = APIRouter(prefix="/api", tags=["statistics"])


@router.get("/stats/attempts")
def list_attempt_stats(
    client_id: str = Query(..., alias="clientId"),
    test_id: str | None = Query(None, alias="testId"),
    start_date: str | None = Query(None, alias="startDate"),
    end_date: str | None = Query(None, alias="endDate"),
    limit: int | None = Query(None, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> dict[str, object]:
    """List all attempts for a client with optional filters.

    Args:
        client_id: The client ID to filter by (required)
        test_id: Optional test ID to filter by
        start_date: Optional start date filter (ISO format)
        end_date: Optional end date filter (ISO format)
        limit: Optional limit on number of results
        offset: Number of results to skip (for pagination)

    Returns:
        Dictionary with attempts list and pagination info
    """
    client_id = validate_id("clientId", client_id)
    if test_id:
        test_id = validate_id("testId", test_id)

    results = []

    for entry in load_attempt_index():
        if entry.get("clientId") != client_id:
            continue
        attempt_id = entry.get("attemptId")
        if not attempt_id:
            continue

        # Filter by test_id if specified
        if test_id and entry.get("testId") != test_id:
            continue

        # Filter by date range
        completed_at = entry.get("completedAt") or entry.get("startedAt")
        if completed_at:
            if start_date and completed_at < start_date:
                continue
            if end_date and completed_at > end_date:
                continue

        summary = {}
        score = entry.get("score")
        percent = entry.get("percent")
        answered_count = entry.get("answeredCount")
        skipped_count = entry.get("skippedCount")
        avg_time_per_question = entry.get("avgTimePerQuestion")
        fatigue_point = entry.get("fatiguePoint")
        focus_stability_index = entry.get("focusStabilityIndex")
        personal_difficulty_score = entry.get("personalDifficultyScore")

        if isinstance(score, (int, float)) and not isinstance(score, bool):
            summary["score"] = score
        if isinstance(percent, (int, float)) and not isinstance(percent, bool):
            summary["percentCorrect"] = percent
        if isinstance(answered_count, (int, float)) and not isinstance(
            answered_count, bool
        ):
            summary["answeredCount"] = answered_count
        if isinstance(skipped_count, (int, float)) and not isinstance(
            skipped_count, bool
        ):
            summary["skippedCount"] = skipped_count
        if isinstance(avg_time_per_question, (int, float)) and not isinstance(
            avg_time_per_question, bool
        ):
            summary["avgTimePerQuestion"] = avg_time_per_question
        if isinstance(fatigue_point, (int, float)) and not isinstance(
            fatigue_point, bool
        ):
            summary["fatiguePoint"] = fatigue_point
        if isinstance(focus_stability_index, (int, float)) and not isinstance(
            focus_stability_index, bool
        ):
            summary["focusStabilityIndex"] = focus_stability_index
        if isinstance(personal_difficulty_score, (int, float)) and not isinstance(
            personal_difficulty_score, bool
        ):
            summary["personalDifficultyScore"] = personal_difficulty_score

        results.append(
            {
                "attemptId": entry.get("attemptId"),
                "testId": entry.get("testId"),
                "clientId": entry.get("clientId"),
                "startedAt": entry.get("startedAt"),
                "completedAt": entry.get("completedAt"),
                "createdAt": entry.get("startedAt"),
                "finalizedAt": entry.get("completedAt"),
                "statsVersion": entry.get("statsVersion"),
                "summary": summary or None,
            }
        )

    # Sort by date (newest first)
    results.sort(
        key=lambda x: x.get("completedAt") or x.get("startedAt") or "",
        reverse=True
    )

    # Apply pagination
    total = len(results)
    if offset:
        results = results[offset:]
    if limit:
        results = results[:limit]

    return {
        "attempts": results,
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.get("/stats/attempts/{attempt_id}")
def get_attempt_stats(
    attempt_id: str,
    client_id: str = Query(..., alias="clientId"),
) -> dict[str, object]:
    """Get detailed statistics for an attempt."""
    attempt_id = validate_id("attemptId", attempt_id)
    client_id = validate_id("clientId", client_id)

    attempt_payload = load_attempt_meta(attempt_id)
    if not isinstance(attempt_payload, dict):
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt_payload.get("clientId") != client_id:
        raise HTTPException(status_code=404, detail="Attempt not found")

    events = load_attempt_events(attempt_id)

    from api.services.stats_service import load_attempt_stats

    stats_payload = load_attempt_stats(attempt_id)

    timestamps = attempt_payload.get("timestamps", {})
    attempt_response = {
        **attempt_payload,
        "createdAt": timestamps.get("createdAt"),
        "finalizedAt": timestamps.get("finalizedAt"),
        "aggregates": stats_payload.get("aggregates", {}),
        "summary": stats_payload.get("summary"),
        "statsVersion": stats_payload.get("statsVersion"),
    }

    return {
        "attempt": attempt_response,
        "eventCount": len(events),
        "events": events,
    }


@router.post("/stats/attempts/rebuild")
def rebuild_attempt_stats_index() -> dict[str, object]:
    """Rebuild attempt index from all metadata."""
    entries = rebuild_attempt_index()
    return {"status": "rebuilt", "count": len(entries)}


@router.post("/attempts/{attempt_id}/rebuild")
def rebuild_attempt_from_events(
    attempt_id: str,
    admin: bool = Query(False, alias="admin"),
) -> dict[str, object]:
    """Rebuild attempt statistics from events (admin only)."""
    if not admin:
        raise HTTPException(status_code=403, detail="Rebuild not allowed")

    attempt_id = validate_id("attemptId", attempt_id)
    attempt_meta = load_attempt_meta(attempt_id)
    if not isinstance(attempt_meta, dict):
        raise HTTPException(status_code=404, detail="Attempt not found")

    from api.utils import attempt_events_path

    events_path = attempt_events_path(attempt_id)
    if not events_path.exists():
        raise HTTPException(status_code=409, detail="Events not available")

    test_id = attempt_meta.get("testId")
    client_id = attempt_meta.get("clientId")
    if not isinstance(test_id, str) or not isinstance(client_id, str):
        raise HTTPException(status_code=400, detail="Invalid attempt metadata")

    validate_test_exists(test_id)

    events = load_attempt_events(attempt_id)
    test_payload = load_test_payload(test_id)

    summary = build_attempt_summary_from_events(
        attempt_id, attempt_meta, test_payload, events
    )

    stats_payload = write_attempt_stats_from_summary(
        attempt_id,
        test_id,
        client_id,
        summary,
        event_count=len(events),
    )

    timestamps = attempt_meta.get("timestamps")
    if not isinstance(timestamps, dict):
        timestamps = {}
    timestamps["updatedAt"] = utc_now()
    attempt_meta["timestamps"] = timestamps
    write_json_file(attempt_meta_path(attempt_id), attempt_meta)

    attempt_response = {
        **attempt_meta,
        "createdAt": timestamps.get("createdAt"),
        "finalizedAt": timestamps.get("finalizedAt"),
        "aggregates": stats_payload.get("aggregates", {}),
        "summary": stats_payload.get("summary"),
        "statsVersion": stats_payload.get("statsVersion"),
    }

    return {
        "status": "rebuilt",
        "attempt": attempt_response,
        "eventCount": len(events),
    }


@router.get("/tests/{test_id}/statistics")
def get_test_statistics(
    test_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, object]:
    """Get statistics for a test (owner only).

    Returns aggregated statistics for all attempts on this test,
    including per-user breakdown.
    """
    test_id = validate_id("testId", test_id)
    validate_test_exists(test_id)

    # Check if user is owner
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can view test statistics")

    # Collect all attempts for this test
    all_attempts = []
    user_stats: dict[str, dict[str, object]] = {}

    for entry in load_attempt_index():
        if entry.get("testId") != test_id:
            continue

        attempt_id = entry.get("attemptId")
        client_id = entry.get("clientId")
        if not attempt_id or not client_id:
            continue

        score = entry.get("score")
        percent = entry.get("percent")
        accuracy = entry.get("accuracy")
        answered_count = entry.get("answeredCount")
        question_count_used = entry.get("questionCountUsed")
        completed_at = entry.get("completedAt")

        attempt_data = {
            "attemptId": attempt_id,
            "clientId": client_id,
            "score": score,
            "percent": percent,
            "accuracy": accuracy,
            "answeredCount": answered_count,
            "questionCountUsed": question_count_used,
            "completedAt": completed_at,
        }
        all_attempts.append(attempt_data)

        # Aggregate per user
        if client_id not in user_stats:
            user_stats[client_id] = {
                "clientId": client_id,
                "attemptCount": 0,
                "totalScore": 0,
                "totalPercent": 0.0,
                "totalAccuracy": 0.0,
                "validPercentCount": 0,
                "validAccuracyCount": 0,
                "bestPercent": None,
                "bestAccuracy": None,
                "lastAttemptAt": None,
            }

        stats = user_stats[client_id]
        stats["attemptCount"] += 1

        if isinstance(score, (int, float)) and not isinstance(score, bool):
            stats["totalScore"] += score

        if isinstance(percent, (int, float)) and not isinstance(percent, bool):
            stats["totalPercent"] += percent
            stats["validPercentCount"] += 1
            if stats["bestPercent"] is None or percent > stats["bestPercent"]:
                stats["bestPercent"] = percent

        if isinstance(accuracy, (int, float)) and not isinstance(accuracy, bool):
            stats["totalAccuracy"] += accuracy
            stats["validAccuracyCount"] += 1
            if stats["bestAccuracy"] is None or accuracy > stats["bestAccuracy"]:
                stats["bestAccuracy"] = accuracy

        if completed_at:
            if stats["lastAttemptAt"] is None or completed_at > stats["lastAttemptAt"]:
                stats["lastAttemptAt"] = completed_at

    # Calculate averages for each user
    users_list = []
    for client_id, stats in user_stats.items():
        avg_percent = (
            stats["totalPercent"] / stats["validPercentCount"]
            if stats["validPercentCount"] > 0
            else None
        )
        avg_accuracy = (
            stats["totalAccuracy"] / stats["validAccuracyCount"]
            if stats["validAccuracyCount"] > 0
            else None
        )

        users_list.append({
            "clientId": client_id,
            "attemptCount": stats["attemptCount"],
            "avgPercent": avg_percent,
            "avgAccuracy": avg_accuracy,
            "bestPercent": stats["bestPercent"],
            "bestAccuracy": stats["bestAccuracy"],
            "totalScore": stats["totalScore"],
            "lastAttemptAt": stats["lastAttemptAt"],
        })

    # Sort users by best accuracy (descending)
    users_list.sort(
        key=lambda x: (x["bestAccuracy"] or 0, x["attemptCount"]),
        reverse=True
    )

    # Calculate overall statistics
    total_attempts = len(all_attempts)
    total_users = len(users_list)

    overall_percent_sum = sum(
        entry.get("percent") or 0
        for entry in all_attempts
        if isinstance(entry.get("percent"), (int, float))
    )
    overall_percent_count = sum(
        1 for entry in all_attempts
        if isinstance(entry.get("percent"), (int, float))
    )
    overall_avg_percent = (
        overall_percent_sum / overall_percent_count
        if overall_percent_count > 0
        else None
    )

    overall_accuracy_sum = sum(
        entry.get("accuracy") or 0
        for entry in all_attempts
        if isinstance(entry.get("accuracy"), (int, float))
    )
    overall_accuracy_count = sum(
        1 for entry in all_attempts
        if isinstance(entry.get("accuracy"), (int, float))
    )
    overall_avg_accuracy = (
        overall_accuracy_sum / overall_accuracy_count
        if overall_accuracy_count > 0
        else None
    )

    return {
        "testId": test_id,
        "totalAttempts": total_attempts,
        "totalUsers": total_users,
        "overallAvgPercent": overall_avg_percent,
        "overallAvgAccuracy": overall_avg_accuracy,
        "users": users_list,
        "recentAttempts": sorted(
            all_attempts,
            key=lambda x: x.get("completedAt") or "",
            reverse=True
        )[:20],  # Last 20 attempts
    }
