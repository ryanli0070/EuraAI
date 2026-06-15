"""Chat follow-up flow: continue a Socratic dialogue with the student."""
from __future__ import annotations

import logging

from app import config
from app.llm.client import get_client
from app.llm.guardrail import hint_leaks_answer
from app.llm.prompts import FOLLOWUP_SYSTEM_PROMPT, STRICTER_RETRY_FOLLOWUP

logger = logging.getLogger(__name__)


def ask_followup(latex: str, history: list[dict], question: str) -> str:
    """Generate a Socratic follow-up reply.

    `history` is the prior chat turns (excluding the new question), each item
    shaped {"role": "user"|"assistant", "text": str}. `latex` is the last
    transcribed canvas content (may be empty if no /check has been run)."""
    client = get_client()
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
            model=config.OPENAI_MODEL,
            messages=msgs,
            # Reasoning models spend tokens on hidden reasoning that counts against
            # this budget, so the cap must leave room beyond the ~220-token reply
            # itself or the visible content comes back empty.
            max_completion_tokens=1200,
            **config.model_call_kwargs(0.3),
        )
        return (completion.choices[0].message.content or "").strip()

    reply = _call(messages)
    if hint_leaks_answer(reply):
        logger.warning("followup leaked answer; retrying with stricter system")
        stricter = messages + [{"role": "system", "content": STRICTER_RETRY_FOLLOWUP}]
        reply = _call(stricter)
        if hint_leaks_answer(reply):
            logger.error("followup leak persisted after retry; falling back")
            return (
                "Try working through that step on its own — which piece of it "
                "are you least sure about, and can you check it against the "
                "line above it?"
            )
    return reply
