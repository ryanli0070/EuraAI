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
from app.llm.prompts import FEW_SHOTS, STRICTER_RETRY_INSTRUCTION, SYSTEM_PROMPT

logger = logging.getLogger(__name__)


def _build_text_messages(latex: str, stricter: bool) -> list[dict]:
    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for user, assistant in FEW_SHOTS:
        messages.append({"role": "user", "content": user})
        messages.append({"role": "assistant", "content": json.dumps(assistant)})
    if stricter:
        messages.append({"role": "system", "content": STRICTER_RETRY_INSTRUCTION})
    messages.append({"role": "user", "content": latex})
    return messages


def _build_vision_messages(image_b64: str) -> list[dict]:
    """System prompt + text few-shots + the image as the final user turn.
    Few-shots stay text-only (we don't have labeled handwriting images); their
    job is to calibrate the output shape and the quoted-anchor hint style."""
    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for user, assistant in FEW_SHOTS:
        messages.append({"role": "user", "content": user})
        messages.append({"role": "assistant", "content": json.dumps(assistant)})
    messages.append({
        "role": "user",
        "content": [
            {"type": "text", "text": "Here is my handwritten work. Transcribe each step, then check it."},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
        ],
    })
    return messages


def _call_text_tutor(latex: str, stricter: bool) -> TutorOutput:
    completion = get_client().beta.chat.completions.parse(
        model=config.OPENAI_MODEL,
        messages=_build_text_messages(latex, stricter=stricter),
        response_format=TutorOutput,
        **config.model_call_kwargs(0.2),
    )
    parsed = completion.choices[0].message.parsed
    assert parsed is not None, "OpenAI returned no parsed payload"
    return parsed


def check_image(image_bytes: bytes) -> TutorOutput:
    """Single-call path: take the whiteboard PNG, the model transcribes + analyzes + hints."""
    png = preprocess(image_bytes)
    b64 = base64.b64encode(png).decode("ascii")
    completion = get_client().beta.chat.completions.parse(
        model=config.OPENAI_MODEL,
        messages=_build_vision_messages(b64),
        response_format=TutorOutput,
        **config.model_call_kwargs(0.2),
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
    sys_msg = (
        SYSTEM_PROMPT
        + f"\n\nIMPORTANT: Symbolic verification has determined that the first incorrect step is "
        f"0-based index {error_index}, which is: `{step_latex}`. Your hint MUST quote that exact "
        f"step in $...$ delimiters and target it. Do not contradict this."
    )
    messages: list[dict] = [{"role": "system", "content": sys_msg}]
    for user, assistant in FEW_SHOTS:
        messages.append({"role": "user", "content": user})
        messages.append({"role": "assistant", "content": json.dumps(assistant)})
    messages.append({"role": "user", "content": latex})
    completion = get_client().beta.chat.completions.parse(
        model=config.OPENAI_MODEL,
        messages=messages,
        response_format=TutorOutput,
        **config.model_call_kwargs(0.2),
    )
    parsed = completion.choices[0].message.parsed
    if parsed is None or hint_leaks_answer(parsed.hint):
        return f"Re-check the step ${step_latex}$ — does it follow from the line above it?"
    return parsed.hint
