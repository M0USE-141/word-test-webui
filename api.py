import os
import shutil
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Body, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from logging_setup import setup_console_logging
from serialization import serialize_metadata, serialize_test_payload
from word_extract import WordTestExtractor

setup_console_logging()

def _resource_path(relative: str) -> Path:
    if getattr(sys, "frozen", False):
        base_dir = Path(sys._MEIPASS)
    else:
        base_dir = Path(__file__).resolve().parent
    return base_dir / relative


DATA_DIR = Path(os.environ.get("TEST_DATA_DIR", Path.cwd() / "data" / "tests"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
ATTEMPTS_DIR = Path(
    os.environ.get("TEST_ATTEMPTS_DIR", Path.cwd() / "data" / "attempts")
)
ATTEMPTS_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR = _resource_path("static")

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


class TestCreate(BaseModel):
    title: str


class AttemptEventPayload(BaseModel):
    attemptId: str | None = None
    testId: str = Field(..., min_length=1)
    clientId: str = Field(..., min_length=1)
    ts: str = Field(..., min_length=1)
    timezone: str = Field(..., min_length=1)
    settings: dict[str, object]
    questionId: int | None = None
    questionIndex: int | None = None
    answerId: int | str | None = None
    isCorrect: bool | None = None
    durationMs: int | None = None
    isSkipped: bool | None = None
    eventType: str = Field(..., min_length=1)


class AttemptFinalizeRequest(BaseModel):
    attemptId: str | None = None
    testId: str = Field(..., min_length=1)
    clientId: str = Field(..., min_length=1)
    ts: str = Field(..., min_length=1)
    timezone: str = Field(..., min_length=1)
    settings: dict[str, object]
    aggregates: dict[str, object] | None = None
    summary: dict[str, object] | None = None


class AttemptFinalizeResponse(BaseModel):
    status: str
    attempt: dict[str, object]


def _test_dir(test_id: str) -> Path:
    return DATA_DIR / test_id


def _payload_path(test_id: str) -> Path:
    return _test_dir(test_id) / "test.json"


def _assets_dir(test_id: str) -> Path:
    return _test_dir(test_id) / "assets"


def _attempt_dir(attempt_id: str) -> Path:
    return ATTEMPTS_DIR / attempt_id


def _attempt_meta_path(attempt_id: str) -> Path:
    return _attempt_dir(attempt_id) / "meta.json"


def _attempt_events_path(attempt_id: str) -> Path:
    return _attempt_dir(attempt_id) / "events.ndjson"


def _attempt_stats_path(attempt_id: str) -> Path:
    return _attempt_dir(attempt_id) / "stats.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_id(name: str, value: str) -> str:
    if not isinstance(value, str):
        raise HTTPException(status_code=400, detail=f"{name} is required")
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"{name} is required")
    if Path(cleaned).name != cleaned or "/" in cleaned or "\\" in cleaned:
        raise HTTPException(status_code=400, detail=f"Invalid {name}")
    return cleaned


def _validate_test_exists(test_id: str) -> None:
    if not _payload_path(test_id).exists():
        raise HTTPException(status_code=404, detail="Test not found")


def _read_json_file(path: Path, default: object) -> object:
    if not path.exists():
        return default
    return json_load(path.read_text(encoding="utf-8"))


def _write_json_file(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json_dump(payload), encoding="utf-8")


def _event_dedupe_key(event: dict[str, object]) -> str:
    event_id = event.get("eventId")
    if isinstance(event_id, str) and event_id.strip():
        return f"id:{event_id.strip()}"
    event_type = str(event.get("eventType", "")).strip()
    ts = event.get("ts")
    question_id = event.get("questionId")
    return f"{event_type}|{ts}|{question_id}"


def _ensure_attempt_metadata(
    attempt_id: str,
    test_id: str,
    client_id: str,
    settings: dict[str, object] | None = None,
    event_ts: str | None = None,
) -> dict[str, object]:
    meta_path = _attempt_meta_path(attempt_id)
    existing = _read_json_file(meta_path, None)
    if isinstance(existing, dict):
        if existing.get("testId") != test_id:
            raise HTTPException(status_code=400, detail="Mismatched testId")
        if existing.get("clientId") != client_id:
            raise HTTPException(status_code=400, detail="Mismatched clientId")
        if settings and not existing.get("settings"):
            existing["settings"] = settings
        timestamps = existing.get("timestamps")
        if not isinstance(timestamps, dict):
            timestamps = {}
        timestamps["updatedAt"] = _utc_now()
        if event_ts:
            timestamps["lastEventAt"] = event_ts
        existing["timestamps"] = timestamps
        _write_json_file(meta_path, existing)
        return existing
    timestamps = {
        "createdAt": _utc_now(),
        "updatedAt": _utc_now(),
    }
    if event_ts:
        timestamps["lastEventAt"] = event_ts
    payload = {
        "attemptId": attempt_id,
        "testId": test_id,
        "clientId": client_id,
        "settings": settings or {},
        "timestamps": timestamps,
    }
    _write_json_file(meta_path, payload)
    return payload


def _load_attempt_events(attempt_id: str) -> list[dict[str, object]]:
    events_path = _attempt_events_path(attempt_id)
    if not events_path.exists():
        return []
    events: list[dict[str, object]] = []
    for line in events_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            payload = json_load(line)
        except ValueError:
            continue
        if isinstance(payload, dict):
            events.append(payload)
    return events


def _append_attempt_event(attempt_id: str, event: dict[str, object]) -> None:
    events_path = _attempt_events_path(attempt_id)
    events_path.parent.mkdir(parents=True, exist_ok=True)
    line = ndjson_dump(event)
    with events_path.open("a", encoding="utf-8") as handle:
        handle.write(f"{line}\n")


def _load_attempt_stats(attempt_id: str) -> dict[str, object]:
    data = _read_json_file(_attempt_stats_path(attempt_id), {})
    return data if isinstance(data, dict) else {}


def _load_attempt_meta(attempt_id: str) -> dict[str, object] | None:
    payload = _read_json_file(_attempt_meta_path(attempt_id), None)
    return payload if isinstance(payload, dict) else None


def _iter_attempt_metas() -> list[dict[str, object]]:
    metas: list[dict[str, object]] = []
    if not ATTEMPTS_DIR.exists():
        return metas
    for attempt_dir in sorted(ATTEMPTS_DIR.iterdir()):
        if not attempt_dir.is_dir():
            continue
        meta_payload = _read_json_file(attempt_dir / "meta.json", None)
        if isinstance(meta_payload, dict):
            metas.append(meta_payload)
    return metas

def _safe_asset_path(base_dir: Path, asset_path: str) -> Path:
    resolved = (base_dir / asset_path).resolve()
    if base_dir.resolve() not in resolved.parents and resolved != base_dir.resolve():
        raise HTTPException(status_code=400, detail="Invalid asset path")
    return resolved


def _save_upload_file(upload: UploadFile, target_dir: Path) -> Path:
    target_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(upload.filename or "asset").name
    candidate = target_dir / safe_name
    if candidate.exists():
        suffix = candidate.suffix
        candidate = target_dir / f"{candidate.stem}_{uuid.uuid4().hex[:8]}{suffix}"
    candidate.write_bytes(upload.file.read())
    return candidate


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


@app.post("/api/tests")
def create_test(payload: TestCreate) -> dict[str, object]:
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    test_id = uuid.uuid4().hex
    test_dir = _test_dir(test_id)
    test_dir.mkdir(parents=True, exist_ok=True)
    assets_dir = _assets_dir(test_id)
    assets_dir.mkdir(parents=True, exist_ok=True)
    test_payload = serialize_test_payload(test_id, title, [], assets_dir)
    _save_test_payload(test_id, test_payload)
    return {"metadata": serialize_metadata(test_payload), "payload": test_payload}


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
    file_name = file.filename or ""
    if Path(file_name).suffix.lower() == ".doc":
        raise HTTPException(status_code=400, detail="Поддерживаются только .docx")
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


@app.post("/api/tests/{test_id}/assets")
def upload_asset(test_id: str, file: UploadFile = File(...)) -> dict[str, str]:
    assets_dir = _assets_dir(test_id)
    if not _test_dir(test_id).exists():
        raise HTTPException(status_code=404, detail="Test not found")
    saved_path = _save_upload_file(file, assets_dir)
    return {
        "src": saved_path.relative_to(assets_dir).as_posix(),
        "name": saved_path.name,
        "id": saved_path.stem,
    }


def _text_to_blocks(text: str) -> list[dict[str, object]]:
    lines = text.splitlines() if text is not None else [""]
    if not lines:
        lines = [""]
    blocks = []
    for line in lines:
        blocks.append(
            {
                "type": "paragraph",
                "inlines": [{"type": "text", "text": line}],
            }
        )
    return blocks


def _extract_blocks(value: object) -> list[dict[str, object]] | None:
    if isinstance(value, dict):
        blocks = value.get("blocks")
        if isinstance(blocks, list):
            return blocks
    return None


def _load_test_payload(test_id: str) -> dict[str, object]:
    payload_path = _payload_path(test_id)
    if not payload_path.exists():
        raise HTTPException(status_code=404, detail="Test not found")
    return json_load(payload_path.read_text(encoding="utf-8"))


def _save_test_payload(test_id: str, payload: dict[str, object]) -> None:
    _payload_path(test_id).write_text(json_dump(payload), encoding="utf-8")


def _find_question(
    payload: dict[str, object], question_id: int
) -> tuple[dict[str, object], int]:
    questions = payload.get("questions", [])
    if not isinstance(questions, list):
        raise HTTPException(status_code=400, detail="Invalid test payload")
    for index, question in enumerate(questions):
        if isinstance(question, dict) and question.get("id") == question_id:
            return question, index
    raise HTTPException(status_code=404, detail="Question not found")


@app.patch("/api/tests/{test_id}/questions/{question_id}")
def update_question(
    test_id: str,
    question_id: int,
    payload: dict[str, object] = Body(...),
) -> dict[str, object]:
    test_payload = _load_test_payload(test_id)
    question, _ = _find_question(test_payload, question_id)

    question_blocks = _extract_blocks(payload.get("question"))
    question_text = payload.get("questionText")
    if question_blocks is not None:
        question["question"] = {"blocks": question_blocks}
    elif question_text is not None:
        question["question"] = {"blocks": _text_to_blocks(str(question_text))}

    options_payload = payload.get("options")
    if options_payload is not None:
        if not isinstance(options_payload, list) or not options_payload:
            raise HTTPException(status_code=400, detail="Options are required")
        options = []
        correct_blocks = _extract_blocks(payload.get("correct"))
        for index, option in enumerate(options_payload, start=1):
            if not isinstance(option, dict):
                raise HTTPException(
                    status_code=400, detail="Invalid option format"
                )
            content_blocks = _extract_blocks(option.get("content"))
            if content_blocks is None:
                option_text = str(option.get("text", ""))
                content_blocks = _text_to_blocks(option_text)
            is_correct = bool(option.get("isCorrect"))
            if is_correct and correct_blocks is None:
                correct_blocks = content_blocks
            options.append(
                {
                    "id": index,
                    "content": {"blocks": content_blocks},
                    "isCorrect": is_correct,
                }
            )
        question["options"] = options
        question["correct"] = {
            "blocks": correct_blocks or _text_to_blocks("")
        }

    objects_payload = payload.get("objects")
    if objects_payload is not None:
        if not isinstance(objects_payload, list):
            raise HTTPException(
                status_code=400, detail="Invalid objects format"
            )
        question["objects"] = objects_payload

    _save_test_payload(test_id, test_payload)
    return {"payload": test_payload, "question": question}


@app.post("/api/tests/{test_id}/questions")
def add_question(
    test_id: str,
    payload: dict[str, object] = Body(...),
) -> dict[str, object]:
    test_payload = _load_test_payload(test_id)
    questions = test_payload.get("questions", [])
    if not isinstance(questions, list):
        raise HTTPException(status_code=400, detail="Invalid test payload")

    question_blocks = _extract_blocks(payload.get("question"))
    question_text = payload.get("questionText")
    if question_blocks is None:
        if not isinstance(question_text, str) or not question_text.strip():
            raise HTTPException(
                status_code=400, detail="Question text is required"
            )
        question_blocks = _text_to_blocks(question_text)
    options_payload = payload.get("options")
    if not isinstance(options_payload, list) or not options_payload:
        raise HTTPException(status_code=400, detail="Options are required")

    next_id = max((q.get("id", 0) for q in questions if isinstance(q, dict)), default=0) + 1
    options = []
    correct_blocks = _extract_blocks(payload.get("correct"))
    for index, option in enumerate(options_payload, start=1):
        if not isinstance(option, dict):
            raise HTTPException(status_code=400, detail="Invalid option format")
        content_blocks = _extract_blocks(option.get("content"))
        if content_blocks is None:
            option_text = str(option.get("text", ""))
            content_blocks = _text_to_blocks(option_text)
        is_correct = bool(option.get("isCorrect"))
        if is_correct and correct_blocks is None:
            correct_blocks = content_blocks
        options.append(
            {
                "id": index,
                "content": {"blocks": content_blocks},
                "isCorrect": is_correct,
            }
        )

    new_question = {
        "id": next_id,
        "question": {"blocks": question_blocks},
        "options": options,
        "correct": {"blocks": correct_blocks or _text_to_blocks("")},
    }
    objects_payload = payload.get("objects")
    if isinstance(objects_payload, list):
        new_question["objects"] = objects_payload
    questions.append(new_question)
    test_payload["questions"] = questions
    _save_test_payload(test_id, test_payload)
    return {"payload": test_payload, "question": new_question}


@app.delete("/api/tests/{test_id}/questions/{question_id}")
def delete_question(test_id: str, question_id: int) -> dict[str, object]:
    test_payload = _load_test_payload(test_id)
    question, index = _find_question(test_payload, question_id)
    questions = test_payload.get("questions", [])
    if not isinstance(questions, list):
        raise HTTPException(status_code=400, detail="Invalid test payload")
    questions.pop(index)
    test_payload["questions"] = questions
    _save_test_payload(test_id, test_payload)
    return {"payload": test_payload, "question": question}


@app.post("/api/attempts/{attempt_id}/events")
def record_attempt_event(
    attempt_id: str,
    payload: AttemptEventPayload,
) -> dict[str, object]:
    attempt_id = _validate_id("attemptId", attempt_id)
    test_id = _validate_id("testId", payload.testId)
    client_id = _validate_id("clientId", payload.clientId)
    _validate_test_exists(test_id)

    event = payload.dict()
    if event.get("attemptId") and event["attemptId"] != attempt_id:
        raise HTTPException(status_code=400, detail="Mismatched attemptId")
    if event.get("testId") != test_id:
        raise HTTPException(status_code=400, detail="Mismatched testId")
    if event.get("clientId") != client_id:
        raise HTTPException(status_code=400, detail="Mismatched clientId")

    _ensure_attempt_metadata(
        attempt_id, test_id, client_id, payload.settings, payload.ts
    )
    events = _load_attempt_events(attempt_id)
    dedupe_key = _event_dedupe_key(event)
    existing_keys = {_event_dedupe_key(item) for item in events}
    if dedupe_key in existing_keys:
        return {"status": "duplicate", "attemptId": attempt_id, "event": event}

    stored_event = dict(event)
    stored_event["attemptId"] = attempt_id
    stored_event["testId"] = test_id
    stored_event["clientId"] = client_id
    _append_attempt_event(attempt_id, stored_event)
    return {"status": "recorded", "attemptId": attempt_id, "event": stored_event}


@app.post("/api/attempts/{attempt_id}/finalize", response_model=AttemptFinalizeResponse)
def finalize_attempt(
    attempt_id: str,
    payload: AttemptFinalizeRequest,
) -> dict[str, object]:
    attempt_id = _validate_id("attemptId", attempt_id)
    test_id = _validate_id("testId", payload.testId)
    client_id = _validate_id("clientId", payload.clientId)
    _validate_test_exists(test_id)
    if payload.attemptId and payload.attemptId != attempt_id:
        raise HTTPException(status_code=400, detail="Mismatched attemptId")

    attempt_payload = _ensure_attempt_metadata(
        attempt_id, test_id, client_id, payload.settings, payload.ts
    )
    aggregates = payload.aggregates or {}
    if not isinstance(aggregates, dict):
        raise HTTPException(status_code=400, detail="aggregates must be an object")
    summary = payload.summary if isinstance(payload.summary, dict) else None
    per_question = []
    if summary and isinstance(summary.get("perQuestion"), list):
        per_question = summary.get("perQuestion")
    events = _load_attempt_events(attempt_id)
    stats_payload = {
        "attemptId": attempt_id,
        "testId": test_id,
        "clientId": client_id,
        "aggregates": aggregates,
        "summary": summary,
        "perQuestion": per_question,
        "eventCount": len(events),
    }
    _write_json_file(_attempt_stats_path(attempt_id), stats_payload)
    timestamps = attempt_payload.get("timestamps")
    if not isinstance(timestamps, dict):
        timestamps = {}
    timestamps["finalizedAt"] = _utc_now()
    timestamps["updatedAt"] = _utc_now()
    attempt_payload["timestamps"] = timestamps
    _write_json_file(_attempt_meta_path(attempt_id), attempt_payload)
    timestamps = attempt_payload.get("timestamps", {})
    attempt_response = {
        **attempt_payload,
        "createdAt": timestamps.get("createdAt"),
        "finalizedAt": timestamps.get("finalizedAt"),
        "aggregates": aggregates,
        "summary": summary,
    }
    return {"status": "finalized", "attempt": attempt_response}


@app.get("/api/stats/attempts")
def list_attempt_stats(
    client_id: str = Query(..., alias="clientId"),
) -> list[dict[str, object]]:
    client_id = _validate_id("clientId", client_id)
    results = []
    for attempt_payload in _iter_attempt_metas():
        if attempt_payload.get("clientId") != client_id:
            continue
        attempt_id = attempt_payload.get("attemptId")
        if not attempt_id:
            continue
        stats_payload = _load_attempt_stats(str(attempt_id))
        timestamps = attempt_payload.get("timestamps", {})
        if not isinstance(timestamps, dict):
            timestamps = {}
        results.append(
            {
                "attemptId": attempt_payload.get("attemptId"),
                "testId": attempt_payload.get("testId"),
                "clientId": attempt_payload.get("clientId"),
                "createdAt": timestamps.get("createdAt"),
                "finalizedAt": timestamps.get("finalizedAt"),
                "eventCount": stats_payload.get("eventCount", 0),
                "aggregates": stats_payload.get("aggregates", {}),
                "summary": stats_payload.get("summary"),
            }
        )
    return results


@app.get("/api/stats/attempts/{attempt_id}")
def get_attempt_stats(
    attempt_id: str,
    client_id: str = Query(..., alias="clientId"),
) -> dict[str, object]:
    attempt_id = _validate_id("attemptId", attempt_id)
    client_id = _validate_id("clientId", client_id)
    attempt_payload = _load_attempt_meta(attempt_id)
    if not isinstance(attempt_payload, dict):
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt_payload.get("clientId") != client_id:
        raise HTTPException(status_code=404, detail="Attempt not found")
    events = _load_attempt_events(attempt_id)
    stats_payload = _load_attempt_stats(attempt_id)
    timestamps = attempt_payload.get("timestamps", {})
    attempt_response = {
        **attempt_payload,
        "createdAt": timestamps.get("createdAt"),
        "finalizedAt": timestamps.get("finalizedAt"),
        "aggregates": stats_payload.get("aggregates", {}),
        "summary": stats_payload.get("summary"),
    }
    return {
        "attempt": attempt_response,
        "eventCount": len(events),
        "events": events,
    }


def json_dump(payload: object) -> str:
    import json

    return json.dumps(payload, ensure_ascii=False, indent=2)


def ndjson_dump(payload: object) -> str:
    import json

    return json.dumps(payload, ensure_ascii=False)


def json_load(data: str) -> object:
    import json

    return json.loads(data)
