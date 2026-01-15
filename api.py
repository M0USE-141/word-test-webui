import os
import shutil
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from logging_setup import setup_console_logging
from serialization import serialize_metadata, serialize_test_payload
from word_extract import WordTestExtractor

setup_console_logging()

DATA_DIR = Path(os.environ.get("TEST_DATA_DIR", "data/tests"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR = Path("static")

app = FastAPI(title="Test Extractor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def index() -> FileResponse:
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Frontend not found")
    return FileResponse(index_path)


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class TestUpdate(BaseModel):
    title: str


def _test_dir(test_id: str) -> Path:
    return DATA_DIR / test_id


def _payload_path(test_id: str) -> Path:
    return _test_dir(test_id) / "test.json"


def _assets_dir(test_id: str) -> Path:
    return _test_dir(test_id) / "assets"


def _safe_asset_path(base_dir: Path, asset_path: str) -> Path:
    resolved = (base_dir / asset_path).resolve()
    if base_dir.resolve() not in resolved.parents and resolved != base_dir.resolve():
        raise HTTPException(status_code=400, detail="Invalid asset path")
    return resolved


@app.get("/api/tests")
def list_tests() -> list[dict[str, object]]:
    tests = []
    for test_dir in sorted(DATA_DIR.iterdir()):
        if not test_dir.is_dir():
            continue
        payload_path = test_dir / "test.json"
        if not payload_path.exists():
            continue
        payload = payload_path.read_text(encoding="utf-8")
        tests.append(serialize_metadata(json_load(payload)))
    return tests


@app.get("/api/tests/{test_id}")
def get_test(test_id: str) -> dict[str, object]:
    payload_path = _payload_path(test_id)
    if not payload_path.exists():
        raise HTTPException(status_code=404, detail="Test not found")
    payload = payload_path.read_text(encoding="utf-8")
    return json_load(payload)


@app.post("/api/tests/upload")
def upload_test(
    file: UploadFile = File(...),
    symbol: str = Form("*"),
    log_small_tables: bool = Form(False),
) -> dict[str, object]:
    test_id = uuid.uuid4().hex
    test_dir = _test_dir(test_id)
    test_dir.mkdir(parents=True, exist_ok=True)
    assets_dir = _assets_dir(test_id)
    assets_dir.mkdir(parents=True, exist_ok=True)

    safe_name = Path(file.filename or f"upload_{test_id}.docx").name
    file_path = test_dir / safe_name
    file_path.write_bytes(file.file.read())

    extractor = WordTestExtractor(
        file_path,
        symbol,
        log_small_tables,
        assets_dir,
    )
    try:
        tests = extractor.extract()
        payload = serialize_test_payload(test_id, file_path.stem, tests, assets_dir)
        _payload_path(test_id).write_text(
            json_dump(payload), encoding="utf-8"
        )
    finally:
        extractor.cleanup()

    return {
        "metadata": serialize_metadata(payload),
        "payload": payload,
        "logs": extractor.logs,
    }


@app.patch("/api/tests/{test_id}")
def update_test(test_id: str, update: TestUpdate) -> dict[str, object]:
    payload_path = _payload_path(test_id)
    if not payload_path.exists():
        raise HTTPException(status_code=404, detail="Test not found")
    title = update.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    payload = json_load(payload_path.read_text(encoding="utf-8"))
    payload["title"] = title
    payload_path.write_text(json_dump(payload), encoding="utf-8")
    return serialize_metadata(payload)


@app.delete("/api/tests/{test_id}")
def delete_test(test_id: str) -> dict[str, str]:
    test_dir = _test_dir(test_id)
    if not test_dir.exists() or not test_dir.is_dir():
        raise HTTPException(status_code=404, detail="Test not found")
    shutil.rmtree(test_dir)
    return {"status": "deleted"}


@app.get("/api/tests/{test_id}/assets/{asset_path:path}")
def get_asset(test_id: str, asset_path: str) -> FileResponse:
    assets_dir = _assets_dir(test_id)
    file_path = _safe_asset_path(assets_dir, asset_path)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")
    return FileResponse(file_path)


def json_dump(payload: dict[str, object]) -> str:
    import json

    return json.dumps(payload, ensure_ascii=False, indent=2)


def json_load(data: str) -> dict[str, object]:
    import json

    return json.loads(data)
