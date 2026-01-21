from __future__ import annotations
from dataclasses import dataclass
from typing import List


@dataclass
class ContentItem:
    item_type: str  # "text" | "image" | "formula" | "paragraph_break" | "line_break"
    value: str = ""
    formula_id: str | None = None
    path: str | None = None
    formula_text: str | None = None


@dataclass
class TestOption:
    content: List[ContentItem]
    is_correct: bool = False


@dataclass
class TestQuestion:
    question: List[ContentItem]
    correct: List[ContentItem]
    options: List[TestOption]

