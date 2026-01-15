from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Dict


@dataclass
class ContentItem:
    item_type: str  # "text" | "image" | "paragraph_break" | "line_break"
    value: str = ""


@dataclass
class TestOption:
    content: List[ContentItem]
    is_correct: bool = False


@dataclass
class TestQuestion:
    question: List[ContentItem]
    correct: List[ContentItem]
    options: List[TestOption]


@dataclass
class TestSession:
    questions: List[TestQuestion]
    answers: Dict[int, int] = field(default_factory=dict)
    current_index: int = 0
    option_orders: Dict[int, List[TestOption]] = field(default_factory=dict)
    finished: bool = False
    answer_status: Dict[int, str] = field(default_factory=dict)
    test_id: str | None = None
