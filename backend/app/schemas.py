from typing import Literal

from pydantic import BaseModel, Field

CheckStatus = Literal["ok", "all_correct", "no_math", "error"]


class CheckResponse(BaseModel):
    latex: str = Field(..., description="LaTeX extracted from the canvas image.")
    hint: str = Field(..., description="Socratic hint shown to the student. Empty when status != 'ok'.")
    step_index: int = Field(0, description="0-based index of the first wrong step. 0 when not applicable.")
    status: CheckStatus = "ok"
