"""Service for cleanup operations."""
import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete

from api.database import SessionLocal
from api.models.db.attempt import Attempt, AttemptStatus


# Default retention: 90 days for abandoned attempts, unlimited for completed
ABANDONED_RETENTION_DAYS = 90


def cleanup_abandoned_attempts() -> int:
    """Remove old abandoned attempts from database."""
    if ABANDONED_RETENTION_DAYS <= 0:
        return 0

    cutoff = datetime.now(timezone.utc) - timedelta(days=ABANDONED_RETENTION_DAYS)
    logger = logging.getLogger(__name__)

    try:
        db = SessionLocal()
        try:
            # Delete abandoned attempts older than retention period
            result = db.execute(
                delete(Attempt).where(
                    Attempt.status == AttemptStatus.ABANDONED.value,
                    Attempt.started_at < cutoff,
                )
            )
            db.commit()
            deleted = result.rowcount
            if deleted > 0:
                logger.info(f"Cleaned up {deleted} abandoned attempts")
            return deleted
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Failed to cleanup abandoned attempts: {e}")
        return 0


def schedule_events_cleanup() -> None:
    """Schedule periodic cleanup of old attempts."""
    # Run cleanup once per day
    cleanup_interval = 24 * 60 * 60

    def _worker() -> None:
        # Initial delay before first cleanup
        time.sleep(60)
        while True:
            try:
                cleanup_abandoned_attempts()
            except Exception:
                pass
            time.sleep(cleanup_interval)

    thread = threading.Thread(
        target=_worker,
        name="attempts_cleanup",
        daemon=True,
    )
    thread.start()
