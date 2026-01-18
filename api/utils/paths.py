"""Path utilities for tests and attempts."""
from pathlib import Path

from api.config import ATTEMPTS_DIR, DATA_DIR


def test_dir(test_id: str) -> Path:
    """Get directory for test."""
    return DATA_DIR / test_id


def payload_path(test_id: str) -> Path:
    """Get path to test payload JSON."""
    return test_dir(test_id) / "test.json"


def assets_dir(test_id: str) -> Path:
    """Get directory for test assets."""
    return test_dir(test_id) / "assets"


def attempt_dir(attempt_id: str) -> Path:
    """Get directory for attempt."""
    return ATTEMPTS_DIR / attempt_id


def attempt_meta_path(attempt_id: str) -> Path:
    """Get path to attempt metadata JSON."""
    return attempt_dir(attempt_id) / "meta.json"


def attempt_events_path(attempt_id: str) -> Path:
    """Get path to attempt events NDJSON."""
    return attempt_dir(attempt_id) / "events.ndjson"


def attempt_stats_path(attempt_id: str) -> Path:
    """Get path to attempt statistics JSON."""
    return attempt_dir(attempt_id) / "stats.json"