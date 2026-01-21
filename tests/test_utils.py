import io
from pathlib import Path

import pytest
from fastapi import HTTPException, UploadFile

from api.utils import file_utils, json_utils, paths, time_utils, validation


def test_safe_asset_path_allows_nested(tmp_path: Path) -> None:
    base_dir = tmp_path / "assets"
    base_dir.mkdir()
    resolved = file_utils.safe_asset_path(base_dir, "images/logo.png")
    assert resolved == (base_dir / "images" / "logo.png").resolve()


def test_safe_asset_path_blocks_traversal(tmp_path: Path) -> None:
    base_dir = tmp_path / "assets"
    base_dir.mkdir()
    with pytest.raises(HTTPException):
        file_utils.safe_asset_path(base_dir, "../secret.txt")


def test_save_upload_file_deduplicates_name(tmp_path: Path) -> None:
    target_dir = tmp_path / "uploads"
    target_dir.mkdir()
    (target_dir / "test.txt").write_text("first", encoding="utf-8")

    upload = UploadFile(filename="test.txt", file=io.BytesIO(b"second"))
    saved_path = file_utils.save_upload_file(upload, target_dir)

    assert saved_path.exists()
    assert saved_path.name != "test.txt"
    assert saved_path.read_text(encoding="utf-8") == "second"


def test_json_round_trip(tmp_path: Path) -> None:
    payload = {"message": "привет", "count": 2}
    dumped = json_utils.json_dump(payload)
    assert "привет" in dumped
    assert json_utils.json_load(dumped) == payload

    path = tmp_path / "payload.json"
    json_utils.write_json_file(path, payload)
    assert json_utils.read_json_file(path, {}) == payload
    assert json_utils.read_json_file(tmp_path / "missing.json", {"fallback": True}) == {"fallback": True}


def test_time_utils_parsing() -> None:
    timestamp = time_utils.utc_now()
    parsed = time_utils.parse_iso_timestamp(timestamp)
    assert parsed is not None

    zulu = "2024-01-01T12:00:00Z"
    parsed_zulu = time_utils.parse_iso_timestamp(zulu)
    assert parsed_zulu is not None
    assert parsed_zulu.tzinfo is not None

    assert time_utils.parse_iso_timestamp("") is None
    assert time_utils.parse_iso_timestamp(123) is None


def test_paths_helpers(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
    assert paths.test_dir("abc") == tmp_path / "abc"
    assert paths.payload_path("abc") == tmp_path / "abc" / "test.json"
    assert paths.assets_dir("abc") == tmp_path / "abc" / "assets"


def test_validate_id() -> None:
    assert validation.validate_id("test", "abc") == "abc"
    with pytest.raises(HTTPException):
        validation.validate_id("test", "")
    with pytest.raises(HTTPException):
        validation.validate_id("test", "../bad")


def test_validate_test_exists(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
    missing_id = "missing"
    with pytest.raises(HTTPException):
        validation.validate_test_exists(missing_id)

    test_id = "exists"
    payload = paths.payload_path(test_id)
    payload.parent.mkdir(parents=True, exist_ok=True)
    payload.write_text("{}", encoding="utf-8")
    validation.validate_test_exists(test_id)
