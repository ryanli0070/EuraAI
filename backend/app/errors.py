"""Typed error hierarchy. Internal layers raise these; main.py maps them to HTTP."""
from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse


class EuraError(Exception):
    """Base for application-level errors. `status_code` maps to HTTP."""

    status_code: int = 500
    detail: str = "internal error"

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.detail)
        if detail:
            self.detail = detail


class FileTooLargeError(EuraError):
    status_code = 413
    detail = "uploaded file exceeds the size limit"


class NoImageError(EuraError):
    status_code = 400
    detail = "no image provided"


class LLMError(EuraError):
    status_code = 502
    detail = "upstream LLM error"


class LLMTimeoutError(LLMError):
    status_code = 504
    detail = "upstream LLM timed out"


async def eura_error_handler(_request: Request, exc: EuraError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
