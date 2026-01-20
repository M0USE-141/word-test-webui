"""Test-related Pydantic models."""
from pydantic import BaseModel


class TestCreate(BaseModel):
    """Model for creating a new test."""

    title: str
    access_level: str | None = None


class TestUpdate(BaseModel):
    """Model for updating test metadata."""

    title: str
