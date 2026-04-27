"""Help flow: student image -> explicit explanation of the error."""
from __future__ import annotations

import base64

from app import config
from app.llm.client import get_client
from app.llm.image import preprocess
from app.llm.models import HelpOutput
from app.llm.prompts import HELP_SYSTEM_PROMPT


def _build_help_messages(image_b64: str) -> list[dict]:
    return [
        {"role": "system", "content": HELP_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Here is my handwritten work. Please explain exactly what is wrong and how to fix it."},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
            ],
        },
    ]


def help_image(image_bytes: bytes) -> HelpOutput:
    """Explicit help path: GPT-4o identifies the wrong step and explains the error directly."""
    png = preprocess(image_bytes)
    b64 = base64.b64encode(png).decode("ascii")
    completion = get_client().beta.chat.completions.parse(
        model=config.OPENAI_MODEL,
        messages=_build_help_messages(b64),
        response_format=HelpOutput,
        temperature=0.2,
    )
    parsed = completion.choices[0].message.parsed
    assert parsed is not None, "OpenAI returned no parsed payload"
    return parsed
