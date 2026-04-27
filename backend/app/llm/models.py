"""LLM-internal Pydantic models (response_format schemas).
Distinct from app/schemas.py, which holds the API request/response models."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class Step(BaseModel):
    latex: str
    valid: bool
    error_type: Optional[str] = None


class TutorOutput(BaseModel):
    steps: list[Step]
    first_error_index: Optional[int] = None
    all_correct: bool
    hint: str
    confidence: float = Field(ge=0.0, le=1.0)


class HelpOutput(BaseModel):
    steps: list[Step]
    first_error_index: Optional[int] = None
    all_correct: bool
    explanation: str
    confidence: float = Field(ge=0.0, le=1.0)
