from pydantic import BaseModel, Field


class CheckResponse(BaseModel):
    latex: str = Field(description="LaTeX transcribed from the image")
    hint: str = Field(description="Socratic question nudging the student")
    step_index: int | None = Field(
        default=None,
        description="0-based index of the first incorrect step, or null if all correct",
    )
    status: str = Field(description="'error_found' | 'all_correct' | 'no_math'")
