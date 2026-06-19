"""Check flow: student image -> Socratic hint via the vision model + leak guardrail."""
from __future__ import annotations

import base64
import json
import logging

from app import config
from app.llm.client import get_client
from app.llm.guardrail import hint_leaks_answer
from app.llm.image import preprocess
from app.llm.models import TutorOutput
from app.llm.prompts import (
    FEW_SHOTS,
    SCOPED_SELECTION_INSTRUCTION,
    STRICTER_RETRY_INSTRUCTION,
    SYSTEM_PROMPT,
)

logger = logging.getLogger(__name__)


# A stable key for every text/vision Check call. They all share the same
# SYSTEM_PROMPT + FEW_SHOTS prefix, so one key routes them to the same backend
# and lets them reuse the same cached prefix (OpenAI prompt caching).
_CHECK_CACHE_KEY = "tutor-check"


def _build_text_messages(latex: str, extra_system: str | None = None) -> list[dict]:
    """SYSTEM_PROMPT + few-shots + the student's LaTeX as the final turn.

    The SYSTEM_PROMPT + few-shots prefix is byte-identical across every Check
    call, which is exactly what OpenAI's prompt cache keys on. Any per-call
    instruction (stricter-retry, SymPy override) goes in `extra_system` as a
    *trailing* system message so it never perturbs that cacheable prefix."""
    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for user, assistant in FEW_SHOTS:
        messages.append({"role": "user", "content": user})
        messages.append({"role": "assistant", "content": json.dumps(assistant)})
    if extra_system:
        messages.append({"role": "system", "content": extra_system})
    messages.append({"role": "user", "content": latex})
    return messages


def _build_vision_messages(image_b64: str, extra_system: str | None = None) -> list[dict]:
    """System prompt + text few-shots + the image as the final user turn.
    Few-shots stay text-only (we don't have labeled handwriting images); their
    job is to calibrate the output shape and the quoted-anchor hint style.

    `extra_system` (e.g. the scoped-selection instruction) rides along as a
    *trailing* system message so it never perturbs the cacheable system+few-shot
    prefix — same pattern as `_build_text_messages`."""
    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for user, assistant in FEW_SHOTS:
        messages.append({"role": "user", "content": user})
        messages.append({"role": "assistant", "content": json.dumps(assistant)})
    if extra_system:
        messages.append({"role": "system", "content": extra_system})
    messages.append({
        "role": "user",
        "content": [
            {"type": "text", "text": "Here is my handwritten work. Transcribe each step, then check it."},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
        ],
    })
    return messages


def _call_text_tutor(latex: str, stricter: bool) -> TutorOutput:
    extra = STRICTER_RETRY_INSTRUCTION if stricter else None
    completion = get_client().beta.chat.completions.parse(
        model=config.OPENAI_MODEL,
        messages=_build_text_messages(latex, extra_system=extra),
        response_format=TutorOutput,
        **config.model_call_kwargs(
            0.2, cache_key=_CHECK_CACHE_KEY, reasoning_effort=config.REASONING_EFFORT_ANALYSIS
        ),
    )
    parsed = completion.choices[0].message.parsed
    assert parsed is not None, "OpenAI returned no parsed payload"
    return parsed


def check_image(image_bytes: bytes, escalate: bool = False, scoped: bool = False) -> TutorOutput:
    """Single-call path: take the whiteboard PNG, the model transcribes + analyzes + hints.

    `escalate=True` re-runs the same call at the higher ESCALATED reasoning effort
    — used by the reactive retry when the first pass comes back low-confidence.
    `scoped=True` means the student lassoed a region and wants only that checked,
    so the model is told to check exactly what's shown and not ask for more."""
    png = preprocess(image_bytes)
    b64 = base64.b64encode(png).decode("ascii")
    effort = config.REASONING_EFFORT_ESCALATED if escalate else config.REASONING_EFFORT_ANALYSIS
    extra = SCOPED_SELECTION_INSTRUCTION if scoped else None
    completion = get_client().beta.chat.completions.parse(
        model=config.OPENAI_MODEL,
        messages=_build_vision_messages(b64, extra_system=extra),
        response_format=TutorOutput,
        **config.model_call_kwargs(0.2, cache_key=_CHECK_CACHE_KEY, reasoning_effort=effort),
    )
    parsed = completion.choices[0].message.parsed
    assert parsed is not None, "OpenAI returned no parsed payload"
    return parsed


def apply_guardrail(latex: str, output: TutorOutput) -> tuple[str, int, str]:
    """Return (hint, step_index, status). Retries the LLM once with a stricter
    prompt if the hint leaks an answer; falls back to a generic hint on second leak."""
    if output.all_correct or not output.hint.strip():
        return ("", 0, "all_correct")

    if output.hint and hint_leaks_answer(output.hint):
        logger.warning("hint leak detected, retrying with stricter prompt")
        output = _call_text_tutor(latex, stricter=True)
        if hint_leaks_answer(output.hint):
            logger.error("hint leak persisted after retry; falling back to generic")
            idx = output.first_error_index or 0
            step_latex = output.steps[idx].latex if 0 <= idx < len(output.steps) else ""
            fallback = (
                f"Re-check ${step_latex}$ — does it follow from the line above it?"
                if step_latex
                else "Re-check the step where you transformed the equation — does each side stay equivalent?"
            )
            return (fallback, idx, "ok")

    return (output.hint, output.first_error_index or 0, "ok")


def rewrite_hint_for_index(latex: str, error_index: int, step_latex: str) -> str:
    """SymPy verification override: SymPy says step `error_index` is the first
    wrong one. Generate a hint targeting that exact step regardless of what the
    LLM picked first."""
    # Keep SYSTEM_PROMPT untouched as message[0] so this call reuses the same
    # cached prefix as every other Check call; the SymPy override rides along as
    # a trailing system message instead of being spliced into the system prompt.
    override = (
        f"IMPORTANT: Symbolic verification has determined that the first incorrect step is "
        f"0-based index {error_index}, which is: `{step_latex}`. Your hint MUST quote that exact "
        f"step in $...$ delimiters and target it. Do not contradict this."
    )
    completion = get_client().beta.chat.completions.parse(
        model=config.OPENAI_MODEL,
        messages=_build_text_messages(latex, extra_system=override),
        response_format=TutorOutput,
        **config.model_call_kwargs(
            0.2, cache_key=_CHECK_CACHE_KEY, reasoning_effort=config.REASONING_EFFORT_ANALYSIS
        ),
    )
    parsed = completion.choices[0].message.parsed
    if parsed is None or hint_leaks_answer(parsed.hint):
        return f"Re-check the step ${step_latex}$ — does it follow from the line above it?"
    return parsed.hint
