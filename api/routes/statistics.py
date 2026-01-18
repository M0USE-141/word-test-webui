"""Statistics endpoints."""
from fastapi import APIRouter, HTTPException, Query

from api.utils import attempt_meta_path, utc_now, validate_id, validate_test_exists, write_json_file
from api.services.attempt_service import (
    load_attempt_events,
    load_attempt_meta,
)
from api.services.stats_service import (
    build_attempt_summary_from_events,
    load_attempt_index,
    rebuild_attempt_index,
    write_attempt_stats_from_summary,
)
from api.services.test_service import load_test_payload

router = APIRouter(prefix="/api", tags=["statistics"])


@router.get("/stats/attempts")
def list_attempt_stats(
    client_id: str = Query(..., alias="clientId"),
) -> list[dict[str, object]]:
    """List all attempts for a client."""
    client_id = validate_id("clientId", client_id)
    results = []

    for entry in load_attempt_index():
        if entry.get("clientId") != client_id:
            continue
        attempt_id = entry.get("attemptId")
        if not attempt_id:
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

    return results


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
