from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

from models import ContentItem, TestQuestion


INLINE_TEXT_TYPE = "text"
INLINE_IMAGE_TYPE = "image"
INLINE_FORMULA_TYPE = "formula"
INLINE_LINE_BREAK_TYPE = "line_break"

BLOCK_PARAGRAPH_TYPE = "paragraph"


def _asset_src(path: str | None, assets_dir: Path | None) -> str | None:
    if not path:
        return None
    asset_path = Path(path)
    if assets_dir is None:
        return asset_path.as_posix()
    try:
        return asset_path.relative_to(assets_dir).as_posix()
    except ValueError:
        return asset_path.name


def content_items_to_blocks(
    items: Iterable[ContentItem],
    assets_dir: Path | None,
) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    inlines: list[dict[str, Any]] = []

    def flush() -> None:
        nonlocal inlines
        if not inlines:
            inlines = [{"type": INLINE_TEXT_TYPE, "text": ""}]
        blocks.append({"type": BLOCK_PARAGRAPH_TYPE, "inlines": inlines})
        inlines = []

    for item in items:
        if item.item_type == "paragraph_break":
            flush()
            continue
        if item.item_type == "text":
            inlines.append({"type": INLINE_TEXT_TYPE, "text": item.value})
            continue
        if item.item_type == "line_break":
            inlines.append({"type": INLINE_LINE_BREAK_TYPE})
            continue
        if item.item_type == "image":
            inlines.append(
                {
                    "type": INLINE_IMAGE_TYPE,
                    "src": _asset_src(item.value or item.path, assets_dir),
                    "alt": "",
                }
            )
            continue
        if item.item_type == "formula":
            inline: dict[str, Any] = {
                "type": INLINE_FORMULA_TYPE,
                "id": item.formula_id,
            }
            src = _asset_src(item.path, assets_dir)
            if src:
                inline["src"] = src
            inlines.append(inline)
            continue
    if inlines:
        flush()
    elif not blocks:
        flush()
    return blocks


def serialize_test_payload(
    test_id: str,
    title: str,
    questions: list[TestQuestion],
    assets_dir: Path | None = None,
) -> dict[str, Any]:
    payload_questions = []
    for index, question in enumerate(questions, start=1):
        payload_questions.append(
            {
                "id": index,
                "question": {
                    "blocks": content_items_to_blocks(question.question, assets_dir)
                },
                "options": [
                    {
                        "id": option_index + 1,
                        "content": {
                            "blocks": content_items_to_blocks(
                                option.content, assets_dir
                            )
                        },
                        "isCorrect": option.is_correct,
                    }
                    for option_index, option in enumerate(question.options)
                ],
                "correct": {
                    "blocks": content_items_to_blocks(question.correct, assets_dir)
                },
            }
        )
    payload = {
        "id": test_id,
        "title": title,
        "assetsBaseUrl": f"/api/tests/{test_id}/assets",
        "questions": payload_questions,
    }
    return payload


def serialize_metadata(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": payload.get("id"),
        "title": payload.get("title"),
        "questionCount": len(payload.get("questions", [])),
    }
