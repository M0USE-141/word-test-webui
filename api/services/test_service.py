"""Service layer for test operations."""
from api.utils import json_load, payload_path, read_json_file, write_json_file


def load_test_payload(test_id: str) -> dict[str, object]:
    """Load test payload from file."""
    path = payload_path(test_id)
    if not path.exists():
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Test not found")
    return json_load(path.read_text(encoding="utf-8"))


def save_test_payload(test_id: str, payload: dict[str, object]) -> None:
    """Save test payload to file."""
    write_json_file(payload_path(test_id), payload)


def find_question(
    payload: dict[str, object], question_id: int
) -> tuple[dict[str, object], int]:
    """Find question in test payload by ID."""
    from fastapi import HTTPException

    questions = payload.get("questions", [])
    if not isinstance(questions, list):
        raise HTTPException(status_code=400, detail="Invalid test payload")

    for index, question in enumerate(questions):
        if isinstance(question, dict) and question.get("id") == question_id:
            return question, index

    raise HTTPException(status_code=404, detail="Question not found")


def text_to_blocks(text: str) -> list[dict[str, object]]:
    """Convert plain text to blocks format."""
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


def extract_blocks(value: object) -> list[dict[str, object]] | None:
    """Extract blocks from value if present."""
    if isinstance(value, dict):
        blocks = value.get("blocks")
        if isinstance(blocks, list):
            return blocks
    return None
