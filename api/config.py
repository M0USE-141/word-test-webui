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

# Database
DB_DIR = Path(os.environ.get("DB_DIR", Path.cwd() / "data"))
DB_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = os.environ.get(
    "DATABASE_URL", f"sqlite:///{DB_DIR / 'testmaster.db'}"
)

# Authentication
SECRET_KEY = os.environ.get(
    "SECRET_KEY",
    "CHANGE_ME_IN_PRODUCTION_USE_openssl_rand_hex_32"
)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = _parse_int_env("ACCESS_TOKEN_EXPIRE_MINUTES", 60)
SESSION_EXTEND_MINUTES = _parse_int_env("SESSION_EXTEND_MINUTES", 60)

# Avatars
AVATARS_DIR = Path(os.environ.get("AVATARS_DIR", Path.cwd() / "data" / "avatars"))
AVATARS_DIR.mkdir(parents=True, exist_ok=True)
AVATAR_MAX_SIZE_BYTES = 2 * 1024 * 1024  # 2 MB
AVATAR_MAX_DIMENSION = 512  # pixels
AVATAR_ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif"}