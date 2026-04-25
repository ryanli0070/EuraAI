import hashlib
import logging

from fastapi import APIRouter, File, Request, UploadFile

from app.limiter import limiter
from app.schemas import HelpResponse
from app.services import log_store, tutor

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/help", response_model=HelpResponse)
@limiter.limit("20/minute")
async def help_work(request: Request, file: UploadFile = File(...)) -> HelpResponse:
    image_bytes = b""
    image_hash = ""
    try:
        image_bytes = await file.read()
        image_hash = hashlib.sha256(image_bytes).hexdigest()

        analysis = tutor.help_image(image_bytes)
        steps_latex = [s.latex for s in analysis.steps]
        latex = "\n".join(steps_latex)

        if not steps_latex:
            resp = HelpResponse(
                latex="",
                explanation="I couldn't see any math on the canvas — try writing larger or darker.",
                status="no_math",
            )
            log_store.record(image_hash=image_hash, latex="", hint=resp.explanation,
                             status=resp.status, step_index=0)
            return resp

        if analysis.all_correct:
            resp = HelpResponse(
                latex=latex,
                explanation="Your work looks correct — every step follows from the previous one.",
                step_index=0,
                status="all_correct",
            )
        else:
            step_index = analysis.first_error_index or 0
            resp = HelpResponse(
                latex=latex,
                explanation=analysis.explanation,
                step_index=step_index,
                status="ok",
            )

        log_store.record(image_hash=image_hash, latex=latex, hint=resp.explanation,
                         status=resp.status, step_index=resp.step_index)
        return resp

    except Exception:
        logger.exception("help_work failed")
        if image_hash:
            log_store.record(image_hash=image_hash, latex="", hint="error",
                             status="error", step_index=0)
        return HelpResponse(
            latex="",
            explanation="Something went wrong on our side — try again in a moment.",
            status="error",
        )
