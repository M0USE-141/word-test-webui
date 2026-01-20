"""Test management endpoints."""
import shutil
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session as DbSession

from api.config import DATA_DIR
from api.database import get_db
from api.dependencies.auth import get_current_user, get_optional_user
from api.models import TestCreate, TestUpdate
from api.models.db.user import User
from api.models.db.test_collection import AccessLevel
from api.services import access_service
from api.utils import assets_dir, json_load, payload_path, test_dir
from api.services.test_service import load_test_payload, save_test_payload
from serialization import serialize_metadata, serialize_test_payload
from word_extract import WordTestExtractor

router = APIRouter(prefix="/api/tests", tags=["tests"])


@router.get("")
def list_tests(
    current_user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> list[dict[str, object]]:
    """List all tests accessible to the current user."""
    # Get accessible test IDs from database
    accessible_ids = set(access_service.get_accessible_test_ids(db, current_user))

    tests = []
    for test_directory in sorted(DATA_DIR.iterdir()):
        if not test_directory.is_dir():
            continue
        payload_file = test_directory / "test.json"
        if not payload_file.exists():
            continue

        test_id = test_directory.name
        payload = payload_file.read_text(encoding="utf-8")
        metadata = serialize_metadata(json_load(payload))

        # Get access info from database
        collection = access_service.get_test_collection_with_owner(db, test_id)
        if collection:
            # Test has access control - check if accessible
            if test_id not in accessible_ids:
                continue
            metadata["access_level"] = collection.access_level
            metadata["owner_id"] = collection.owner_id
            metadata["owner_username"] = collection.owner.username
            metadata["is_owner"] = current_user and collection.owner_id == current_user.id
        else:
            # No access control record - show to everyone (backwards compatibility)
            metadata["access_level"] = "public"
            metadata["owner_id"] = None
            metadata["owner_username"] = None
            metadata["is_owner"] = False

        tests.append(metadata)
    return tests


@router.post("")
def create_test(
    payload: TestCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, object]:
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

    # Create TestCollection record with ownership
    access_level = AccessLevel.PRIVATE
    if payload.access_level:
        try:
            access_level = AccessLevel(payload.access_level)
        except ValueError:
            pass  # Use default if invalid
    access_service.get_or_create_collection(db, test_id, current_user.id, access_level)

    return {"metadata": serialize_metadata(test_payload), "payload": test_payload}


@router.get("/{test_id}")
def get_test(
    test_id: str,
    current_user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, object]:
    """Get test payload."""
    payload_file = payload_path(test_id)
    if not payload_file.exists():
        raise HTTPException(status_code=404, detail="Test not found")

    # Check access permission
    if not access_service.can_view_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    payload = payload_file.read_text(encoding="utf-8")
    result = json_load(payload)

    # Add ownership info
    collection = access_service.get_test_collection_with_owner(db, test_id)
    if collection:
        result["is_owner"] = current_user and collection.owner_id == current_user.id
        result["owner_id"] = collection.owner_id
        result["owner_username"] = collection.owner.username
        result["access_level"] = collection.access_level
    else:
        result["is_owner"] = False
        result["owner_id"] = None
        result["owner_username"] = None
        result["access_level"] = "public"

    return result


@router.patch("/{test_id}")
def update_test(
    test_id: str,
    update: TestUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, object]:
    """Update test metadata."""
    payload_file = payload_path(test_id)
    if not payload_file.exists():
        raise HTTPException(status_code=404, detail="Test not found")

    # Check edit permission
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can edit test")

    title = update.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    from api.utils import json_dump

    payload = json_load(payload_file.read_text(encoding="utf-8"))
    payload["title"] = title
    payload_file.write_text(json_dump(payload), encoding="utf-8")

    return serialize_metadata(payload)


@router.delete("/{test_id}")
def delete_test(
    test_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
) -> dict[str, str]:
    """Delete test."""
    test_directory = test_dir(test_id)
    if not test_directory.exists() or not test_directory.is_dir():
        raise HTTPException(status_code=404, detail="Test not found")

    # Check edit permission
    if not access_service.can_edit_test(db, test_id, current_user):
        raise HTTPException(status_code=403, detail="Only owner can delete test")

    # Delete TestCollection record
    access_service.delete_test_collection(db, test_id)

    shutil.rmtree(test_directory)
    return {"status": "deleted"}


@router.post("/upload")
def upload_test(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[DbSession, Depends(get_db)],
    file: UploadFile = File(...),
    symbol: str = Form("*"),
    log_small_tables: bool = Form(False),
    access_level: str = Form("private"),
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

    # Create TestCollection record with ownership
    try:
        parsed_access_level = AccessLevel(access_level)
    except ValueError:
        parsed_access_level = AccessLevel.PRIVATE
    access_service.get_or_create_collection(db, test_id, current_user.id, parsed_access_level)

    return {
        "metadata": serialize_metadata(test_payload),
        "payload": test_payload,
        "logs": extractor.logs,
    }
