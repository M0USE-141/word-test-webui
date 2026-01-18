"""Service for cleanup operations."""
import threading
import time
from datetime import datetime, timedelta, timezone

from api.config import ATTEMPTS_DIR, EVENTS_CLEANUP_INTERVAL_SECONDS, EVENTS_RETENTION_DAYS


def cleanup_old_events() -> int:
    """Remove old event files based on retention policy."""
    if EVENTS_RETENTION_DAYS <= 0:
        return 0
    if not ATTEMPTS_DIR.exists():
        return 0

    cutoff = datetime.now(timezone.utc) - timedelta(days=EVENTS_RETENTION_DAYS)
    removed = 0

    for attempt_dir in ATTEMPTS_DIR.iterdir():
        if not attempt_dir.is_dir():
            continue
        events_path = attempt_dir / "events.ndjson"
        if not events_path.exists():
            continue
        try:
            modified = datetime.fromtimestamp(
                events_path.stat().st_mtime, timezone.utc
            )
        except OSError:
            continue
        if modified < cutoff:
            try:
                events_path.unlink()
            except OSError:
                continue
            removed += 1
    return removed


def schedule_events_cleanup() -> None:
    """Schedule periodic cleanup of old events."""
    if EVENTS_RETENTION_DAYS <= 0:
        return

    def _worker() -> None:
        while True:
            try:
                cleanup_old_events()
            except Exception:
                pass
            time.sleep(max(60, EVENTS_CLEANUP_INTERVAL_SECONDS))

    thread = threading.Thread(
        target=_worker,
        name="events_cleanup",
        daemon=True,
    )
    thread.start()
