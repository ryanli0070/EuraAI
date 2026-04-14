"""POST /api/check — receive an image, return a Socratic hint."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.schemas import CheckResponse
from app.services import ocr, tutor

router = APIRouter()


@router.post("/check", response_model=CheckResponse)
async def check_work(image: UploadFile) -> CheckResponse:
    """Accepts a PNG/JPEG upload, runs OCR then LLM reasoning."""
    if image.content_type not in ("image/png", "image/jpeg"):
        raise HTTPException(status_code=415, detail="Only PNG and JPEG are accepted")

    image_bytes = await image.read()

    try:
        latex = ocr.image_to_latex(image_bytes)
    except ValueError as exc:
        return CheckResponse(
            latex="",
            hint="",
            step_index=None,
            status="no_math",
        )

    result = tutor.analyse(latex)
    return CheckResponse(**result)
