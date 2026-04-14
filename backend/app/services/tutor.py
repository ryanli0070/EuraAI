"""Tutor service — sends LaTeX to an LLM and returns a Socratic hint."""
from __future__ import annotations

import os

# TODO(phase 4): import openai and/or anthropic clients here


def analyse(latex: str) -> dict:
    """Parse multi-step LaTeX, find the first incorrect step, return a hint.

    Returns a dict matching CheckResponse fields:
      { latex, hint, step_index, status }

    Phase 4 implementation:
    - Single structured-output call to GPT-4o (JSON mode).
    - System prompt enforces Socratic constraint: hints only, never answers.
    - 3-4 few-shot examples covering common error types.
    - Post-process guardrail: reject hint if it contains the expected answer.
    """
    # TODO(phase 4): replace stub with real LLM call
    raise NotImplementedError("Tutor service not yet implemented (Phase 4)")
