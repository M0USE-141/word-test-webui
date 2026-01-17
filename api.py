import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
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


class TestCreate(BaseModel):
    title: str


class AttemptQuestionStat(BaseModel):
    question_id: int
    selected_index: int | None = None
    is_correct: bool | None = None
    duration_seconds: float | None = None


class AttemptCreate(BaseModel):
    started_at: str | None = None
    completed_at: str | None = None
    correct: int
    total: int
    answered: int
    percent: float
    duration_seconds: float | None = None
    question_stats: list[AttemptQuestionStat] = []


def _test_dir(test_id: str) -> Path:
    return DATA_DIR / test_id


def _payload_path(test_id: str) -> Path:
    return _test_dir(test_id) / "test.json"


def _attempts_path(test_id: str) -> Path:
    return _test_dir(test_id) / "attempts.json"


def _assets_dir(test_id: str) -> Path:
    return _test_dir(test_id) / "assets"


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


@app.post("/api/tests/{test_id}/attempts")
def record_attempt(test_id: str, attempt: AttemptCreate) -> dict[str, object]:
    if not _payload_path(test_id).exists():
        raise HTTPException(status_code=404, detail="Test not found")
    attempts = _load_attempts(test_id)
    attempt_payload = attempt.model_dump()
    attempt_payload["id"] = uuid.uuid4().hex
    attempt_payload["recorded_at"] = datetime.utcnow().isoformat() + "Z"
    attempts.append(attempt_payload)
    _save_attempts(test_id, attempts)
    return {"status": "saved", "attempt": attempt_payload}


@app.get("/api/tests/{test_id}/analytics")
def get_analytics(test_id: str) -> dict[str, object]:
    if not _payload_path(test_id).exists():
        raise HTTPException(status_code=404, detail="Test not found")
    attempts = _load_attempts(test_id)
    attempts_count = len(attempts)
    if attempts_count == 0:
        return {
            "test_id": test_id,
            "attempts_count": 0,
            "average_percent": 0,
            "average_correct": 0,
            "average_answered": 0,
            "average_duration_seconds": None,
            "question_stats": [],
            "top_errors": [],
            "time_distribution": [],
        }

    total_percent = 0.0
    total_correct = 0
    total_answered = 0
    duration_sum = 0.0
    duration_count = 0
    question_totals: dict[int, int] = {}
    question_incorrect: dict[int, int] = {}

    time_distribution = {
        "under_2_min": 0,
        "2_to_5_min": 0,
        "5_to_10_min": 0,
        "over_10_min": 0,
    }

    for attempt in attempts:
        total_percent += float(attempt.get("percent", 0))
        total_correct += int(attempt.get("correct", 0))
        total_answered += int(attempt.get("answered", 0))
        duration_seconds = attempt.get("duration_seconds")
        if isinstance(duration_seconds, (int, float)):
            duration_sum += float(duration_seconds)
            duration_count += 1
            if duration_seconds < 120:
                time_distribution["under_2_min"] += 1
            elif duration_seconds < 300:
                time_distribution["2_to_5_min"] += 1
            elif duration_seconds < 600:
                time_distribution["5_to_10_min"] += 1
            else:
                time_distribution["over_10_min"] += 1

        question_stats = attempt.get("question_stats") or []
        if not isinstance(question_stats, list):
            continue
        for entry in question_stats:
            if not isinstance(entry, dict):
                continue
            question_id = entry.get("question_id")
            if not isinstance(question_id, int):
                continue
            question_totals[question_id] = question_totals.get(question_id, 0) + 1
            if entry.get("is_correct") is False:
                question_incorrect[question_id] = (
                    question_incorrect.get(question_id, 0) + 1
                )

    question_stats_payload = []
    for question_id in sorted(question_totals.keys()):
        total = question_totals[question_id]
        incorrect = question_incorrect.get(question_id, 0)
        error_rate = incorrect / total if total else 0
        question_stats_payload.append(
            {
                "question_id": question_id,
                "attempts": total,
                "incorrect": incorrect,
                "error_rate": error_rate,
            }
        )

    top_errors = sorted(
        [entry for entry in question_stats_payload if entry["incorrect"] > 0],
        key=lambda entry: (entry["error_rate"], entry["incorrect"]),
        reverse=True,
    )[:5]

    average_duration_seconds = (
        duration_sum / duration_count if duration_count else None
    )

    return {
        "test_id": test_id,
        "attempts_count": attempts_count,
        "average_percent": total_percent / attempts_count,
        "average_correct": total_correct / attempts_count,
        "average_answered": total_answered / attempts_count,
        "average_duration_seconds": average_duration_seconds,
        "question_stats": question_stats_payload,
        "top_errors": top_errors,
        "time_distribution": [
            {"bucket": bucket, "count": count}
            for bucket, count in time_distribution.items()
        ],
    }


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


def _load_attempts(test_id: str) -> list[dict[str, object]]:
    attempts_path = _attempts_path(test_id)
    if not attempts_path.exists():
        return []
    payload = attempts_path.read_text(encoding="utf-8")
    data = json_load(payload)
    if isinstance(data, list):
        return data
    return []


def _save_attempts(test_id: str, attempts: list[dict[str, object]]) -> None:
    _attempts_path(test_id).write_text(json_dump(attempts), encoding="utf-8")


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


def json_dump(payload: dict[str, object]) -> str:
    import json

    return json.dumps(payload, ensure_ascii=False, indent=2)


def json_load(data: str) -> dict[str, object]:
    import json

    return json.loads(data)
