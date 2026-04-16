import hashlib
import logging

from fastapi import APIRouter, File, Request, UploadFile

from app.limiter import limiter
from app.schemas import CheckResponse
from app.services import log_store, ocr, tutor, verify

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/check", response_model=CheckResponse)
@limiter.limit("20/minute")
async def check_work(request: Request, file: UploadFile = File(...)) -> CheckResponse:
    image_bytes = b""
    image_hash = ""
    try:
        image_bytes = await file.read()
        image_hash = hashlib.sha256(image_bytes).hexdigest()

        latex = ocr.recognize(image_bytes)
        if not latex:
            resp = CheckResponse(
                latex="",
                hint="I couldn't read any math in that image — try writing larger or darker.",
                status="no_math",
            )
            log_store.record(image_hash=image_hash, latex="", hint=resp.hint,
                             status=resp.status, step_index=0)
            return resp

        analysis = tutor.analyze(latex)
        steps_latex = [s.latex for s in analysis.steps]

        sympy_idx = verify.first_invalid_step(steps_latex)

        if sympy_idx is not None and (analysis.all_correct or sympy_idx != analysis.first_error_index):
            logger.info("sympy override: llm=%s, sympy=%s", analysis.first_error_index, sympy_idx)
            hint = tutor.rewrite_hint_for_index(latex, sympy_idx)
            resp = CheckResponse(latex=latex, hint=hint, step_index=sympy_idx, status="ok")
        else:
            hint, step_index, status = tutor.apply_guardrail(latex, analysis)
            resp = CheckResponse(latex=latex, hint=hint, step_index=step_index, status=status)

        log_store.record(image_hash=image_hash, latex=latex, hint=resp.hint,
                         status=resp.status, step_index=resp.step_index)
        return resp

    except Exception:
        logger.exception("check_work failed")
        if image_hash:
            log_store.record(image_hash=image_hash, latex="", hint="error",
                             status="error", step_index=0)
        return CheckResponse(
            latex="",
            hint="Something went wrong on our side — try again in a moment.",
            status="error",
        )
