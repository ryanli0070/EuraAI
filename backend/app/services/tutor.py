"""Socratic tutor: LaTeX of student work -> a leading question (never the answer).

Pipeline:
  1. Single structured-output call to GPT-4o with a system prompt that hard-codes
     the Socratic constraint and 4 few-shot examples.
  2. Post-hoc guardrail scans the hint for answer leakage (e.g. "x = 2",
     "the answer is 5", "should be 4"). If it trips, retry once with a
     stricter system message; if it trips again, fall back to a safe generic.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Optional

from openai import OpenAI
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Snapshot model that supports structured outputs / Pydantic response_format.
_MODEL = "gpt-4o-2024-08-06"

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()  # OPENAI_API_KEY from env
    return _client


SYSTEM_PROMPT = """You are a Socratic math tutor. The student's handwritten work, transcribed to LaTeX, is given to you. Your job is to find the FIRST step that contains a mathematical error and respond with a leading question that nudges the student to find their own mistake.

ABSOLUTE RULES:
- Never state the correct value of any unknown.
- Never write the next algebraic step for the student.
- Never give the answer, even partially (no "x should be larger", no "the sign is wrong on the 4").
- Phrase the hint as a QUESTION about the student's own work, targeting the wrong step.
- Keep hints to one sentence in plain English. You may reference math positionally ("the second line", "the right-hand side").
- If every step is correct, set all_correct=true and hint="".
- If the input is unparseable, set first_error_index=0 with a clarifying question."""


# (user_latex, assistant_payload) — the assistant payload is JSON-serialized
# at message-build time so the model sees the exact schema it must emit.
FEW_SHOTS: list[tuple[str, dict]] = [
    (
        "2x + 3 = 7\n2x = 10\nx = 5",
        {
            "steps": [
                {"latex": "2x + 3 = 7", "valid": True, "error_type": None},
                {"latex": "2x = 10", "valid": False, "error_type": "wrong_inverse_operation"},
                {"latex": "x = 5", "valid": False, "error_type": "propagated"},
            ],
            "first_error_index": 1,
            "all_correct": False,
            "hint": "When you moved the 3 across the equals sign, what operation should you have performed on the other side?",
            "confidence": 0.95,
        },
    ),
    (
        "3(x+2) = 15\n3x + 2 = 15\n3x = 13\nx = 13/3",
        {
            "steps": [
                {"latex": "3(x+2) = 15", "valid": True, "error_type": None},
                {"latex": "3x + 2 = 15", "valid": False, "error_type": "incomplete_distribution"},
                {"latex": "3x = 13", "valid": False, "error_type": "propagated"},
                {"latex": "x = 13/3", "valid": False, "error_type": "propagated"},
            ],
            "first_error_index": 1,
            "all_correct": False,
            "hint": "When you distributed the 3 across the parentheses, did it reach every term inside?",
            "confidence": 0.97,
        },
    ),
    (
        "2x + 3 = 7\n2x = 4\nx = 2",
        {
            "steps": [
                {"latex": "2x + 3 = 7", "valid": True, "error_type": None},
                {"latex": "2x = 4", "valid": True, "error_type": None},
                {"latex": "x = 2", "valid": True, "error_type": None},
            ],
            "first_error_index": None,
            "all_correct": True,
            "hint": "",
            "confidence": 0.99,
        },
    ),
    (
        "x^2 - 5x + 6 = 0\n(x-2)(x-3) = 0\nx = 2, x = -3",
        {
            "steps": [
                {"latex": "x^2 - 5x + 6 = 0", "valid": True, "error_type": None},
                {"latex": "(x-2)(x-3) = 0", "valid": True, "error_type": None},
                {"latex": "x = 2, x = -3", "valid": False, "error_type": "sign_error"},
            ],
            "first_error_index": 2,
            "all_correct": False,
            "hint": "Look at your factored form — what value of x makes the second factor equal zero?",
            "confidence": 0.93,
        },
    ),
]


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


# Direct numeric leakage in the hint. These are heuristics, not perfect — they
# bias toward false positives, which is the right call: a redundant retry costs
# pennies, a leaked answer breaks the product premise.
_LEAK_PATTERNS = [
    re.compile(r"[a-zA-Z]\s*=\s*-?\d+(\.\d+)?"),               # "x = 2"
    re.compile(r"\bequals?\s+-?\d+(\.\d+)?", re.IGNORECASE),
    re.compile(r"\banswer\s+is\b", re.IGNORECASE),
    re.compile(r"\bshould\s+be\s+-?\d+(\.\d+)?", re.IGNORECASE),
    re.compile(r"\bcorrect\s+(?:answer\s+)?is\s+-?\d+", re.IGNORECASE),
]


def _hint_leaks_answer(hint: str) -> bool:
    return any(p.search(hint) for p in _LEAK_PATTERNS)


def _build_messages(latex: str, stricter: bool) -> list[dict]:
    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for user, assistant in FEW_SHOTS:
        messages.append({"role": "user", "content": user})
        messages.append({"role": "assistant", "content": json.dumps(assistant)})
    if stricter:
        messages.append({
            "role": "system",
            "content": (
                "Your previous response leaked the answer. Rewrite the hint as a "
                "pure question about the student's reasoning. Do NOT mention any "
                "specific numeric value, do NOT use '=' followed by a number, do "
                "NOT say 'should be <number>' or 'the answer is'."
            ),
        })
    messages.append({"role": "user", "content": latex})
    return messages


def apply_guardrail(latex: str, output: TutorOutput) -> tuple[str, int, str]:
    """Take a TutorOutput, run the leak guardrail, return (hint, step_index, status).
    Retries the LLM once with a stricter prompt if leakage is detected."""
    if output.all_correct:
        return ("", 0, "all_correct")

    if output.hint and _hint_leaks_answer(output.hint):
        logger.warning("hint leak detected, retrying with stricter prompt")
        output = _call_tutor(_get_client(), latex, stricter=True)
        if _hint_leaks_answer(output.hint):
            logger.error("hint leak persisted after retry; falling back to generic")
            return (
                "Re-check the step where you transformed the equation — does each side stay equivalent?",
                output.first_error_index or 0,
                "ok",
            )

    return (output.hint, output.first_error_index or 0, "ok")


def get_hint(latex: str) -> tuple[str, int, str]:
    """Convenience wrapper: analyze + guardrail in one call. Empty input -> no_math."""
    if not latex.strip():
        return ("", 0, "no_math")
    return apply_guardrail(latex, analyze(latex))


def _call_tutor(client: OpenAI, latex: str, stricter: bool) -> TutorOutput:
    completion = client.beta.chat.completions.parse(
        model=_MODEL,
        messages=_build_messages(latex, stricter=stricter),
        response_format=TutorOutput,
        temperature=0.2,
    )
    parsed = completion.choices[0].message.parsed
    assert parsed is not None, "OpenAI returned no parsed payload"
    return parsed


def rewrite_hint_for_index(latex: str, error_index: int) -> str:
    """Used by Phase 6 verification override: SymPy says step `error_index` is
    actually the first wrong one. Generate a hint targeting that exact step,
    overriding whatever the LLM picked first."""
    client = _get_client()
    sys_msg = (
        SYSTEM_PROMPT
        + f"\n\nIMPORTANT: Symbolic verification has determined that the first incorrect step is at "
        f"0-based index {error_index}. Your hint MUST target that step. Do not contradict this."
    )
    messages: list[dict] = [{"role": "system", "content": sys_msg}]
    for user, assistant in FEW_SHOTS:
        messages.append({"role": "user", "content": user})
        messages.append({"role": "assistant", "content": json.dumps(assistant)})
    messages.append({"role": "user", "content": latex})
    completion = client.beta.chat.completions.parse(
        model=_MODEL, messages=messages, response_format=TutorOutput, temperature=0.2,
    )
    parsed = completion.choices[0].message.parsed
    if parsed is None or _hint_leaks_answer(parsed.hint):
        return "Re-check the step where you transformed the equation — does each side stay equivalent?"
    return parsed.hint


def analyze(latex: str) -> TutorOutput:
    """Raw structured output from the LLM, no guardrail. Used by callers
    that want the full step list (e.g. the verification path)."""
    return _call_tutor(_get_client(), latex, stricter=False)
