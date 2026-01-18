"""File handling utilities."""
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile


def safe_asset_path(base_dir: Path, asset_path: str) -> Path:
    """Resolve asset path safely (prevent path traversal)."""
    resolved = (base_dir / asset_path).resolve()
    if base_dir.resolve() not in resolved.parents and resolved != base_dir.resolve():
        raise HTTPException(status_code=400, detail="Invalid asset path")
    return resolved


def save_upload_file(upload: UploadFile, target_dir: Path) -> Path:
    """Save uploaded file to target directory."""
    target_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(upload.filename or "asset").name
    candidate = target_dir / safe_name
    if candidate.exists():
        suffix = candidate.suffix
        candidate = target_dir / f"{candidate.stem}_{uuid.uuid4().hex[:8]}{suffix}"
    candidate.write_bytes(upload.file.read())
    return candidate