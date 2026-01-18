"""Validation utilities."""
from pathlib import Path

from fastapi import HTTPException

from api.utils.paths import payload_path


def validate_id(name: str, value: str) -> str:
    """Validate ID string (no path traversal)."""
    if not isinstance(value, str):
        raise HTTPException(status_code=400, detail=f"{name} is required")
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"{name} is required")
    if Path(cleaned).name != cleaned or "/" in cleaned or "\\" in cleaned:
        raise HTTPException(status_code=400, detail=f"Invalid {name}")
    return cleaned


def validate_test_exists(test_id: str) -> None:
    """Validate that test exists."""
    if not payload_path(test_id).exists():
        raise HTTPException(status_code=404, detail="Test not found")