"""Path utilities for tests."""
from pathlib import Path

from api.config import DATA_DIR


def test_dir(test_id: str) -> Path:
    """Get directory for test."""
    return DATA_DIR / test_id


def payload_path(test_id: str) -> Path:
    """Get path to test payload JSON."""
    return test_dir(test_id) / "test.json"


def assets_dir(test_id: str) -> Path:
    """Get directory for test assets."""
    return test_dir(test_id) / "assets"
