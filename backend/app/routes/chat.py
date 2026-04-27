import logging

from fastapi import APIRouter, Request

from app.limiter import limiter
from app.schemas import ChatRequest, ChatResponse
from app.services import chat as chat_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
@limiter.limit("30/minute")
async def chat(request: Request, body: ChatRequest) -> ChatResponse:
    question = body.question.strip()
    if not question:
        return ChatResponse(reply="What's your question?")
    try:
        history = [{"role": m.role, "text": m.text} for m in body.history]
        reply = chat_service.ask_followup(body.latex, history, question)
        return ChatResponse(reply=reply)
    except Exception:
        logger.exception("chat failed")
        return ChatResponse(reply="Something went wrong on our side — try again in a moment.")
