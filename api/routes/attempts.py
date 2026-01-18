"""Attempt management endpoints."""
from fastapi import APIRouter, HTTPException

from api.models import AttemptEventPayload, AttemptFinalizeRequest, AttemptFinalizeResponse
from api.utils import (
    attempt_meta_path,
    utc_now,
    validate_id,
    validate_test_exists,
    write_json_file,
)
from api.services.attempt_service import (
    append_attempt_event,
    ensure_attempt_metadata,
    event_dedupe_key,
    iter_attempt_events,
    load_attempt_events,
)
from api.services.stats_service import (
    build_attempt_summary_from_events,
    upsert_attempt_index_entry,
    write_attempt_stats_from_summary,
)
from api.services.test_service import load_test_payload

router = APIRouter(prefix="/api/attempts/{attempt_id}", tags=["attempts"])


@router.post("/events")
def record_attempt_event(
    attempt_id: str,
    payload: AttemptEventPayload,
) -> dict[str, object]:
    """Record an attempt event."""
    attempt_id = validate_id("attemptId", attempt_id)
    test_id = validate_id("testId", payload.testId)
    client_id = validate_id("clientId", payload.clientId)
    validate_test_exists(test_id)

    event = payload.dict()
    if event.get("attemptId") and event["attemptId"] != attempt_id:
        raise HTTPException(status_code=400, detail="Mismatched attemptId")
    if event.get("testId") != test_id:
        raise HTTPException(status_code=400, detail="Mismatched testId")
    if event.get("clientId") != client_id:
        raise HTTPException(status_code=400, detail="Mismatched clientId")

    ensure_attempt_metadata(
        attempt_id, test_id, client_id, payload.settings, payload.ts
    )

    dedupe_event = dict(event)
    dedupe_event["attemptId"] = attempt_id
    dedupe_key = event_dedupe_key(dedupe_event)
    existing_keys = {
        event_dedupe_key(item) for item in iter_attempt_events(attempt_id)
    }

    if dedupe_key in existing_keys:
        return {"status": "duplicate", "attemptId": attempt_id, "event": event}

    stored_event = dict(event)
    stored_event["attemptId"] = attempt_id
    stored_event["testId"] = test_id
    stored_event["clientId"] = client_id
    append_attempt_event(attempt_id, stored_event)

    return {"status": "recorded", "attemptId": attempt_id, "event": stored_event}


@router.post("/finalize", response_model=AttemptFinalizeResponse)
def finalize_attempt(
    attempt_id: str,
    payload: AttemptFinalizeRequest,
) -> dict[str, object]:
    """Finalize an attempt and calculate statistics."""
    attempt_id = validate_id("attemptId", attempt_id)
    test_id = validate_id("testId", payload.testId)
    client_id = validate_id("clientId", payload.clientId)
    validate_test_exists(test_id)

    if payload.attemptId and payload.attemptId != attempt_id:
        raise HTTPException(status_code=400, detail="Mismatched attemptId")

    attempt_payload = ensure_attempt_metadata(
        attempt_id, test_id, client_id, payload.settings, payload.ts
    )

    events = load_attempt_events(attempt_id)
    test_payload = load_test_payload(test_id)

    summary = build_attempt_summary_from_events(
        attempt_id, attempt_payload, test_payload, events
    )

    stats_payload = write_attempt_stats_from_summary(
        attempt_id,
        test_id,
        client_id,
        summary,
        event_count=len(events),
    )

    upsert_attempt_index_entry(
        attempt_id,
        test_id,
        client_id,
        completed_at=payload.ts,
        stats_version=stats_payload.get("statsVersion"),
    )

    timestamps = attempt_payload.get("timestamps")
    if not isinstance(timestamps, dict):
        timestamps = {}
    timestamps["finalizedAt"] = utc_now()
    timestamps["updatedAt"] = utc_now()
    attempt_payload["timestamps"] = timestamps
    attempt_payload["aggregates"] = stats_payload.get("aggregates", {})
    write_json_file(attempt_meta_path(attempt_id), attempt_payload)

    timestamps = attempt_payload.get("timestamps", {})
    attempt_response = {
        **attempt_payload,
        "createdAt": timestamps.get("createdAt"),
        "finalizedAt": timestamps.get("finalizedAt"),
        "aggregates": stats_payload.get("aggregates", {}),
        "summary": stats_payload.get("summary"),
        "statsVersion": stats_payload.get("statsVersion"),
    }

    return {"status": "finalized", "attempt": attempt_response}
