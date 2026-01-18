"""Service layer for attempts and events."""
from fastapi import HTTPException

from api.config import ATTEMPTS_DIR
from api.utils import (
    attempt_events_path,
    attempt_meta_path,
    json_load,
    ndjson_dump,
    read_json_file,
    utc_now,
    write_json_file,
)


def event_dedupe_key(event: dict[str, object]) -> str:
    """Generate deduplication key for event."""
    event_id = event.get("eventId")
    if isinstance(event_id, str) and event_id.strip():
        return f"id:{event_id.strip()}"
    attempt_id = str(event.get("attemptId", "")).strip()
    event_type = str(event.get("eventType", "")).strip()
    ts = event.get("ts")
    question_id = event.get("questionId")
    return f"{attempt_id}|{event_type}|{ts}|{question_id}"


def ensure_attempt_metadata(
    attempt_id: str,
    test_id: str,
    client_id: str,
    settings: dict[str, object] | None = None,
    event_ts: str | None = None,
) -> dict[str, object]:
    """Ensure attempt metadata exists and is up to date."""
    meta_path = attempt_meta_path(attempt_id)
    existing = read_json_file(meta_path, None)

    if isinstance(existing, dict):
        if existing.get("testId") != test_id:
            raise HTTPException(status_code=400, detail="Mismatched testId")
        if existing.get("clientId") != client_id:
            raise HTTPException(status_code=400, detail="Mismatched clientId")
        if settings and not existing.get("settings"):
            existing["settings"] = settings

        timestamps = existing.get("timestamps")
        if not isinstance(timestamps, dict):
            timestamps = {}
        timestamps["updatedAt"] = utc_now()
        if event_ts:
            timestamps["lastEventAt"] = event_ts
        existing["timestamps"] = timestamps
        write_json_file(meta_path, existing)
        return existing

    timestamps = {
        "createdAt": utc_now(),
        "updatedAt": utc_now(),
    }
    if event_ts:
        timestamps["lastEventAt"] = event_ts

    payload = {
        "attemptId": attempt_id,
        "testId": test_id,
        "clientId": client_id,
        "settings": settings or {},
        "timestamps": timestamps,
    }
    write_json_file(meta_path, payload)
    return payload


def iter_attempt_events(attempt_id: str):
    """Iterate over attempt events from NDJSON file."""
    events_path = attempt_events_path(attempt_id)
    if not events_path.exists():
        return iter(())

    def _iterator():
        with events_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                try:
                    payload = json_load(line)
                except ValueError:
                    continue
                if isinstance(payload, dict):
                    yield payload

    return _iterator()


def load_attempt_events(attempt_id: str) -> list[dict[str, object]]:
    """Load all attempt events."""
    return list(iter_attempt_events(attempt_id))


def append_attempt_event(attempt_id: str, event: dict[str, object]) -> None:
    """Append event to attempt events file."""
    events_path = attempt_events_path(attempt_id)
    events_path.parent.mkdir(parents=True, exist_ok=True)
    line = ndjson_dump(event)
    with events_path.open("a", encoding="utf-8") as handle:
        handle.write(f"{line}\n")


def load_attempt_meta(attempt_id: str) -> dict[str, object] | None:
    """Load attempt metadata."""
    payload = read_json_file(attempt_meta_path(attempt_id), None)
    return payload if isinstance(payload, dict) else None


def iter_attempt_metas() -> list[dict[str, object]]:
    """Iterate over all attempt metadata."""
    metas: list[dict[str, object]] = []
    if not ATTEMPTS_DIR.exists():
        return metas
    for attempt_dir in sorted(ATTEMPTS_DIR.iterdir()):
        if not attempt_dir.is_dir():
            continue
        meta_payload = read_json_file(attempt_dir / "meta.json", None)
        if isinstance(meta_payload, dict):
            metas.append(meta_payload)
    return metas
