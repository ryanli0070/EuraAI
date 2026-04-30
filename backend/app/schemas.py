from typing import Literal

from pydantic import BaseModel, Field

CheckStatus = Literal["ok", "all_correct", "no_math", "error"]
ChatRole = Literal["user", "assistant"]


class CheckResponse(BaseModel):
    latex: str = Field(..., description="LaTeX extracted from the canvas image.")
    hint: str = Field(..., description="Socratic hint shown to the student. Empty when status != 'ok'.")
    step_index: int = Field(0, description="0-based index of the first wrong step. 0 when not applicable.")
    status: CheckStatus = "ok"


class ChatMessage(BaseModel):
    role: ChatRole
    text: str


class ChatRequest(BaseModel):
    latex: str = Field("", description="Most recent LaTeX extracted from the canvas, if any.")
    history: list[ChatMessage] = Field(default_factory=list)
    question: str = Field(..., description="The student's new follow-up question.")


class ChatResponse(BaseModel):
    reply: str


class HelpResponse(BaseModel):
    latex: str = Field(..., description="LaTeX extracted from the canvas image.")
    explanation: str = Field(..., description="Explicit explanation of the error and how to fix it.")
    step_index: int = Field(0, description="0-based index of the first wrong step. 0 when not applicable.")
    status: CheckStatus = "ok"


class SignupRequest(BaseModel):
    email: str = Field(..., max_length=254)
    source: str | None = Field(default=None, max_length=64,
                               description="Optional tag for where the signup came from (e.g. 'landing').")


class SignupResponse(BaseModel):
    ok: bool
    already_subscribed: bool = False
