"""Application configuration and constants."""
import os
import sys
from pathlib import Path


def _resource_path(relative: str) -> Path:
    """Get path to resource, works for PyInstaller bundles."""
    if getattr(sys, "frozen", False):
        base_dir = Path(sys._MEIPASS)
    else:
        base_dir = Path(__file__).resolve().parent.parent
    return base_dir / relative


def _parse_int_env(name: str, default: int) -> int:
    """Parse integer from environment variable."""
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


# Directories
DATA_DIR = Path(os.environ.get("TEST_DATA_DIR", Path.cwd() / "data" / "tests"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

ATTEMPTS_DIR = Path(
    os.environ.get("TEST_ATTEMPTS_DIR", Path.cwd() / "data" / "attempts")
)
ATTEMPTS_DIR.mkdir(parents=True, exist_ok=True)

ATTEMPTS_INDEX_PATH = ATTEMPTS_DIR / "index.json"
STATIC_DIR = _resource_path("static")

# Constants
STATS_VERSION = 1
EVENTS_RETENTION_DAYS = _parse_int_env("EVENTS_RETENTION_DAYS", 30)
EVENTS_CLEANUP_INTERVAL_SECONDS = _parse_int_env(
    "EVENTS_CLEANUP_INTERVAL_SECONDS", 24 * 60 * 60
)