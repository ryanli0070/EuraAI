"""OpenAI client singleton."""
from __future__ import annotations

from openai import OpenAI

from app import config

_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=config.OPENAI_API_KEY)
    return _client
