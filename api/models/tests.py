"""Test-related Pydantic models."""
from pydantic import BaseModel


class TestCreate(BaseModel):
    """Model for creating a new test."""

    title: str


class TestUpdate(BaseModel):
    """Model for updating test metadata."""

    title: str
