"""OpenAI API integration."""
from openai import AsyncOpenAI

from config import settings

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key or "not-set")
    return _client


class OpenAIService:
    """Wrapper for OpenAI API calls."""

    async def chat_completion(self, messages: list[dict], model: str = "gpt-4o-mini") -> str:
        """Send messages to Chat Completions API and return assistant content."""
        client = _get_client()
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
        )
        if not response.choices:
            return ""
        return response.choices[0].message.content or ""

    async def complete(self, prompt: str, system: str | None = None) -> str:
        """Simple completion with optional system message."""
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        return await self.chat_completion(messages)


openai_service = OpenAIService()
