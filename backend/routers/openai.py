"""Endpoints that call OpenAI API."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.openai_service import openai_service

router = APIRouter(prefix="/openai", tags=["openai"])


class ChatRequest(BaseModel):
    prompt: str
    system: str | None = None
    model: str = "gpt-4o-mini"


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest):
    """Send a prompt to OpenAI and return the completion."""
    try:
        reply = await openai_service.complete(
            prompt=body.prompt,
            system=body.system,
        )
        return ChatResponse(reply=reply)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenAI request failed: {str(e)}")
