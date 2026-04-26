"""Socratic tutor: student's handwritten work (image) -> leading question (never the answer).

Pipeline:
  1. Single structured-output call to GPT-4o VISION with the whiteboard PNG.
     The model transcribes each step to LaTeX AND identifies the first error AND
     produces the Socratic hint in one call. This removes the Pix2Text OCR layer
     that was hallucinating variables on handwritten input.
  2. Post-hoc guardrail scans the hint for tutor-voice answer leakage
     ("the answer is", "should be N"). On trip, retry once with a stricter
     system message; on second trip, fall back to a safe generic.
"""
from __future__ import annotations

import base64
import io
import json
import logging
import re
from typing import Optional

from openai import OpenAI
from PIL import Image
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Snapshot model that supports structured outputs / Pydantic response_format.
# GPT-4o is multimodal — same model used for both text rewrites and vision.
_MODEL = "gpt-4o-2024-08-06"

# Max width of image sent to the vision API. OpenAI bills per tile and the
# whiteboard PNG is often 3000+px from tldraw's 2x scale. Downscaling to 1600px
# keeps legibility for handwriting while cutting token cost ~4x.
_MAX_IMAGE_WIDTH = 1600

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()  # OPENAI_API_KEY from env
    return _client


SYSTEM_PROMPT = """You are a Socratic math tutor. You will receive either (a) an image of the student's handwritten math work on a whiteboard, or (b) the same work already transcribed to LaTeX, one step per line.

YOUR TASK:
1. If given an image, transcribe each distinct step/line to LaTeX and fill steps[*].latex. Be faithful: do NOT introduce variables, operators, or terms that are not visibly written. If a symbol is ambiguous, prefer the simpler reading (e.g. a single variable the student is clearly solving for) over an exotic one.
2. Find the FIRST step that contains a mathematical error.
3. Respond with a leading question that nudges the student to find the mistake themselves.

MULTIPLE PROBLEMS: The canvas may contain several separate, independent problems. Each problem must be evaluated on its own — do NOT compare steps across different problems. A step is only invalid if it fails to follow from the immediately preceding step of the SAME problem.

ABSOLUTE RULES:
- Never state the correct value of any unknown.
- Never write the next algebraic step for the student.
- Never give the answer, even partially (no "x should be larger", no "the sign is wrong on the 4").
- Phrase the hint as a QUESTION about the student's own work.
- Match complexity to the error: a simple arithmetic mistake needs only a direct check question ("Does $6 + 3 = 12$?"); only conceptual or multi-step errors warrant a more elaborate question. Do NOT over-explain an obvious mistake.

ANCHORING (critical — this is what makes the hint useful):
- Begin the hint by quoting the student's incorrect step VERBATIM in inline math delimiters, e.g. `In $2x = 10$, ...`, `Looking at $3x + 2 = 15$, ...`, `In your third line, $x = -3$, ...`.
- The quoted LaTeX must match one of the steps in `steps[*].latex` exactly — do not paraphrase.
- Also set `first_error_index` to the 0-based index of that step, and set `steps[first_error_index].valid=false`.
- Keep the whole hint to one sentence. For arithmetic errors, the sentence can be as short as quoting the step and asking the direct arithmetic check.

OTHER CASES:
- If every step is correct, set all_correct=true, hint="", and first_error_index=null. This is ABSOLUTE: no hint text, no follow-up question, no verification prompt, no "can you check by substituting back?", no pedagogical nudge of any kind. Algebra and symbol manipulation are held to the same standard as arithmetic — if every step follows correctly from the previous one, all_correct=true and hint="" with no exceptions.
- If the image is blank or contains no math, set steps=[], all_correct=false, first_error_index=null, hint="" and confidence=0.
- If the input is unparseable or has only one step, set first_error_index=0 and ask a clarifying question.
- Before marking any step invalid, verify the algebra yourself. A correct answer using an unconventional method is still correct."""


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
            "hint": "In $2x = 10$, when you moved the $+3$ across the equals sign, what operation should you have performed on the other side?",
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
            "hint": "In $3x + 2 = 15$, did the $3$ reach every term inside the parentheses when you distributed it?",
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
        "y + 3x = 30\n30 - 3(4) = y\ny = 30 - 12\ny = 18",
        {
            "steps": [
                {"latex": "y + 3x = 30", "valid": True, "error_type": None},
                {"latex": "30 - 3(4) = y", "valid": True, "error_type": None},
                {"latex": "y = 30 - 12", "valid": True, "error_type": None},
                {"latex": "y = 18", "valid": True, "error_type": None},
            ],
            "first_error_index": None,
            "all_correct": True,
            "hint": "",
            "confidence": 0.98,
        },
    ),
    (
        "12x = 6x + 3x\n9x = 0\nx = 0",
        {
            "steps": [
                {"latex": "12x = 6x + 3x", "valid": False, "error_type": "arithmetic_error"},
                {"latex": "9x = 0", "valid": False, "error_type": "propagated"},
                {"latex": "x = 0", "valid": False, "error_type": "propagated"},
            ],
            "first_error_index": 0,
            "all_correct": False,
            "hint": "In $12x = 6x + 3x$, does $6 + 3 = 12$?",
            "confidence": 0.99,
        },
    ),
    (
        "x + 3 = 5\nx = 2",
        {
            "steps": [
                {"latex": "x + 3 = 5", "valid": True, "error_type": None},
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
            "hint": "In $x = 2, x = -3$, check the second root against your factor $(x-3)$ — does substituting it back give zero?",
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


# Prescriptive-phrase leak patterns. We deliberately don't match bare
# "x = N" any more — the refined prompt requires the hint to quote the
# student's own (wrong) step verbatim, which trips that pattern. The
# patterns below target tutor-voice assertions ("the answer is", "should
# be N") which never appear in a well-formed Socratic hint.
_LEAK_PATTERNS = [
    re.compile(r"\bequals?\s+-?\d+(\.\d+)?", re.IGNORECASE),
    re.compile(r"\banswer\s+is\b", re.IGNORECASE),
    re.compile(r"\bshould\s+(?:be|equal)\s+-?\d+(\.\d+)?", re.IGNORECASE),
    re.compile(r"\bcorrect\s+(?:answer|value)\s+is\b", re.IGNORECASE),
    re.compile(r"\bthe\s+right\s+(?:answer|value)\b", re.IGNORECASE),
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
    if output.all_correct or not output.hint.strip():
        return ("", 0, "all_correct")

    if output.hint and _hint_leaks_answer(output.hint):
        logger.warning("hint leak detected, retrying with stricter prompt")
        output = _call_tutor(_get_client(), latex, stricter=True)
        if _hint_leaks_answer(output.hint):
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


def rewrite_hint_for_index(latex: str, error_index: int, step_latex: str) -> str:
    """Used by Phase 6 verification override: SymPy says step `error_index` is
    actually the first wrong one. Generate a hint targeting that exact step,
    overriding whatever the LLM picked first. `step_latex` is the literal
    LaTeX of the offending step so the model can quote it."""
    client = _get_client()
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
    completion = client.beta.chat.completions.parse(
        model=_MODEL, messages=messages, response_format=TutorOutput, temperature=0.2,
    )
    parsed = completion.choices[0].message.parsed
    if parsed is None or _hint_leaks_answer(parsed.hint):
        return f"Re-check the step ${step_latex}$ — does it follow from the line above it?"
    return parsed.hint


def analyze(latex: str) -> TutorOutput:
    """Raw structured output from the LLM, no guardrail. Used by callers
    that want the full step list (e.g. the verification path)."""
    return _call_tutor(_get_client(), latex, stricter=False)


def _preprocess_image(image_bytes: bytes) -> bytes:
    """Downscale + normalize the whiteboard PNG before shipping to the vision API."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    if img.width > _MAX_IMAGE_WIDTH:
        ratio = _MAX_IMAGE_WIDTH / img.width
        img = img.resize((_MAX_IMAGE_WIDTH, int(img.height * ratio)))
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


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


FOLLOWUP_SYSTEM_PROMPT = """You are a math tutor mid-conversation with a student. You will receive:
- A CONTEXT block with the student's handwritten steps, transcribed to LaTeX (one step per line). May be empty.
- The prior back-and-forth between you and the student.
- The student's newest question.

Respond with ONE short reply (one sentence preferred, two maximum).

WHEN TO CONFIRM vs WHEN TO QUESTION:
- If the student asks "am I correct?", "is this right?", or similar, and their steps in CONTEXT are mathematically correct: reply with a brief direct confirmation ("Yes, that's correct." or "Exactly right."). Do not ask another question — they already did the work correctly.
- If the student's steps contain an error and they ask for confirmation: gently redirect them to the specific wrong step with a question, without revealing the answer.
- If the student asks for the next step or the answer on work that has an error: respond with a guiding question about the step that went wrong.
- For all other follow-ups about incorrect work: continue the Socratic dialogue with a question.

RULES FOR INCORRECT WORK:
- Never state the correct value of any unknown.
- Never write the next algebraic step for the student.
- When referring to one of the student's steps, quote it verbatim in `$...$` delimiters.
- Do not use the phrase "should be", "the answer is", "equals N", or "the right value"."""


def ask_followup(latex: str, history: list[dict], question: str) -> str:
    """Generate a Socratic follow-up reply.

    `history` is the prior chat turns (excluding the new question), each item
    shaped {"role": "user"|"assistant", "text": str}. `latex` is the last
    transcribed canvas content (may be empty if no /check has been run)."""
    client = _get_client()
    context_block = (
        f"[CONTEXT — student's handwritten steps, one per line]\n{latex}"
        if latex.strip()
        else "[CONTEXT] (none — no canvas analysis has been run yet)"
    )
    messages: list[dict] = [
        {"role": "system", "content": FOLLOWUP_SYSTEM_PROMPT},
        {"role": "system", "content": context_block},
    ]
    for m in history:
        role = m.get("role")
        if role not in ("user", "assistant"):
            continue
        messages.append({"role": role, "content": m.get("text", "")})
    messages.append({"role": "user", "content": question})

    def _call(msgs: list[dict]) -> str:
        completion = client.chat.completions.create(
            model=_MODEL,
            messages=msgs,
            temperature=0.3,
            max_tokens=220,
        )
        return (completion.choices[0].message.content or "").strip()

    reply = _call(messages)
    if _hint_leaks_answer(reply):
        logger.warning("followup leaked answer; retrying with stricter system")
        stricter = messages + [{
            "role": "system",
            "content": (
                "Your previous reply leaked the answer. Rewrite as a pure "
                "question about the student's own reasoning. Do NOT mention "
                "any specific numeric value, do NOT use '=' followed by a "
                "number, do NOT say 'should be N' or 'the answer is'."
            ),
        }]
        reply = _call(stricter)
        if _hint_leaks_answer(reply):
            logger.error("followup leak persisted after retry; falling back")
            return (
                "Try working through that step on its own — which piece of it "
                "are you least sure about, and can you check it against the "
                "line above it?"
            )
    return reply


HELP_SYSTEM_PROMPT = """You are a math tutor. The student has explicitly asked for help — they want a clear explanation of what went wrong, not hints or questions.

YOUR TASK:
1. Transcribe each distinct step to LaTeX (one step per line), filling steps[*].latex.
2. Find the FIRST step that contains a mathematical error.
3. Clearly explain: (a) which step is wrong, (b) exactly what the error is, (c) what the correct step should be.

MULTIPLE PROBLEMS: The canvas may contain several separate, independent problems. Evaluate each problem on its own — do NOT compare steps across different problems. A step is only wrong if it fails to follow from the previous step of the SAME problem.

RESPONSE STYLE — explicit, not Socratic:
- Quote the wrong step verbatim in $...$ delimiters.
- Name the specific error (e.g. "you forgot to distribute the 3", "the sign flipped incorrectly", "you divided instead of subtracted").
- State the correct version of that step (e.g. "It should be $2x = 4$").
- Keep the explanation to 2–3 sentences total.

OTHER CASES:
- If every step is correct: set all_correct=true, explanation="Your work looks correct — every step follows from the previous one.", first_error_index=null.
- If blank/no math: set steps=[], all_correct=false, explanation="I couldn't see any math on the canvas — try writing larger or darker.", first_error_index=null, confidence=0."""


class HelpOutput(BaseModel):
    steps: list[Step]
    first_error_index: Optional[int] = None
    all_correct: bool
    explanation: str
    confidence: float = Field(ge=0.0, le=1.0)


def _build_help_vision_messages(image_b64: str) -> list[dict]:
    messages: list[dict] = [{"role": "system", "content": HELP_SYSTEM_PROMPT}]
    messages.append({
        "role": "user",
        "content": [
            {"type": "text", "text": "Here is my handwritten work. Please explain exactly what is wrong and how to fix it."},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
        ],
    })
    return messages


def help_image(image_bytes: bytes) -> HelpOutput:
    """Explicit help path: GPT-4o identifies the wrong step and explains the error directly."""
    png = _preprocess_image(image_bytes)
    b64 = base64.b64encode(png).decode("ascii")
    completion = _get_client().beta.chat.completions.parse(
        model=_MODEL,
        messages=_build_help_vision_messages(b64),
        response_format=HelpOutput,
        temperature=0.2,
    )
    parsed = completion.choices[0].message.parsed
    assert parsed is not None, "OpenAI returned no parsed payload"
    return parsed


def check_image(image_bytes: bytes) -> TutorOutput:
    """Single-call path: take the whiteboard PNG, let GPT-4o transcribe +
    analyze + hint in one shot. Replaces the old Pix2Text OCR -> analyze
    pipeline (which hallucinated variables on real handwriting)."""
    png = _preprocess_image(image_bytes)
    b64 = base64.b64encode(png).decode("ascii")
    completion = _get_client().beta.chat.completions.parse(
        model=_MODEL,
        messages=_build_vision_messages(b64),
        response_format=TutorOutput,
        temperature=0.2,
    )
    parsed = completion.choices[0].message.parsed
    assert parsed is not None, "OpenAI returned no parsed payload"
    return parsed
