"""Test management endpoints."""
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from api.config import DATA_DIR
from api.models import TestCreate, TestUpdate
from api.utils import assets_dir, json_load, payload_path, test_dir
from api.services.test_service import load_test_payload, save_test_payload
from serialization import serialize_metadata, serialize_test_payload
from word_extract import WordTestExtractor

router = APIRouter(prefix="/api/tests", tags=["tests"])


@router.get("")
def list_tests() -> list[dict[str, object]]:
    """List all tests."""
    tests = []
    for test_directory in sorted(DATA_DIR.iterdir()):
        if not test_directory.is_dir():
            continue
        payload_file = test_directory / "test.json"
        if not payload_file.exists():
            continue
        payload = payload_file.read_text(encoding="utf-8")
        tests.append(serialize_metadata(json_load(payload)))
    return tests


@router.post("")
def create_test(payload: TestCreate) -> dict[str, object]:
    """Create a new test."""
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    test_id = uuid.uuid4().hex
    test_directory = test_dir(test_id)
    test_directory.mkdir(parents=True, exist_ok=True)

    assets_directory = assets_dir(test_id)
    assets_directory.mkdir(parents=True, exist_ok=True)

    test_payload = serialize_test_payload(test_id, title, [], assets_directory)
    save_test_payload(test_id, test_payload)

    return {"metadata": serialize_metadata(test_payload), "payload": test_payload}


@router.get("/{test_id}")
def get_test(test_id: str) -> dict[str, object]:
    """Get test payload."""
    payload_file = payload_path(test_id)
    if not payload_file.exists():
        raise HTTPException(status_code=404, detail="Test not found")
    payload = payload_file.read_text(encoding="utf-8")
    return json_load(payload)


@router.patch("/{test_id}")
def update_test(test_id: str, update: TestUpdate) -> dict[str, object]:
    """Update test metadata."""
    payload_file = payload_path(test_id)
    if not payload_file.exists():
        raise HTTPException(status_code=404, detail="Test not found")

    title = update.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    from api.utils import json_dump

    payload = json_load(payload_file.read_text(encoding="utf-8"))
    payload["title"] = title
    payload_file.write_text(json_dump(payload), encoding="utf-8")

    return serialize_metadata(payload)


@router.delete("/{test_id}")
def delete_test(test_id: str) -> dict[str, str]:
    """Delete test."""
    test_directory = test_dir(test_id)
    if not test_directory.exists() or not test_directory.is_dir():
        raise HTTPException(status_code=404, detail="Test not found")
    shutil.rmtree(test_directory)
    return {"status": "deleted"}


@router.post("/upload")
def upload_test(
    file: UploadFile = File(...),
    symbol: str = Form("*"),
    log_small_tables: bool = Form(False),
) -> dict[str, object]:
    """Upload test from Word document."""
    file_name = file.filename or ""
    if Path(file_name).suffix.lower() == ".doc":
        raise HTTPException(status_code=400, detail="Поддерживаются только .docx")

    test_id = uuid.uuid4().hex
    test_directory = test_dir(test_id)
    test_directory.mkdir(parents=True, exist_ok=True)

    assets_directory = assets_dir(test_id)
    assets_directory.mkdir(parents=True, exist_ok=True)

    safe_name = Path(file.filename or f"upload_{test_id}.docx").name
    file_path = test_directory / safe_name
    file_path.write_bytes(file.file.read())

    extractor = WordTestExtractor(
        file_path,
        symbol,
        log_small_tables,
        assets_directory,
    )
    try:
        tests = extractor.extract()
        test_payload = serialize_test_payload(
            test_id, file_path.stem, tests, assets_directory
        )
        from api.utils import json_dump

        payload_path(test_id).write_text(json_dump(test_payload), encoding="utf-8")
    finally:
        extractor.cleanup()

    return {
        "metadata": serialize_metadata(test_payload),
        "payload": test_payload,
        "logs": extractor.logs,
    }
