import hashlib
import logging

from fastapi import APIRouter, File, Request, UploadFile

from app.errors import FileTooLargeError
from app.limiter import limiter
from app.routes.uploads import read_with_limit
from app.schemas import CheckResponse
from app.services import check as check_service
from app.services import verify
from app.storage import log_store

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/check", response_model=CheckResponse)
@limiter.limit("20/minute")
async def check_work(request: Request, file: UploadFile = File(...)) -> CheckResponse:
    image_hash = ""
    try:
        image_bytes = await read_with_limit(file)
        image_hash = hashlib.sha256(image_bytes).hexdigest()

        # One GPT-4o vision call does OCR + step analysis + Socratic hint.
        analysis = check_service.check_image(image_bytes)
        steps_latex = [s.latex for s in analysis.steps]
        latex = "\n".join(steps_latex)

        if not steps_latex:
            resp = CheckResponse(
                latex="",
                hint="I couldn't see any math on the canvas — try writing larger or darker.",
                status="no_math",
            )
            log_store.record(image_hash=image_hash, latex="", hint=resp.hint,
                             status=resp.status, step_index=0)
            return resp

        # SymPy parsed all steps and confirmed every transition is valid —
        # trust it unconditionally; don't let an LLM hint override correct work.
        if verify.is_definitely_all_correct(steps_latex):
            logger.info("sympy confirmed all correct; ignoring llm hint")
            resp = CheckResponse(latex=latex, hint="", step_index=0, status="all_correct")
        else:
            sympy_idx = verify.first_invalid_step(steps_latex)
            # Only let SymPy *relocate* an error the LLM already identified.
            # The LLM understands multi-problem canvases and cross-problem
            # references (e.g. "x = 2" then "y = 3x"); SymPy compares
            # consecutive lines blindly and would flag those boundaries as
            # invalid transitions. So when the LLM says all_correct, trust it.
            if (
                sympy_idx is not None
                and not analysis.all_correct
                and sympy_idx != analysis.first_error_index
            ):
                logger.info("sympy override: llm=%s, sympy=%s", analysis.first_error_index, sympy_idx)
                step_latex = steps_latex[sympy_idx] if 0 <= sympy_idx < len(steps_latex) else ""
                hint = check_service.rewrite_hint_for_index(latex, sympy_idx, step_latex)
                resp = CheckResponse(latex=latex, hint=hint, step_index=sympy_idx, status="ok")
            else:
                hint, step_index, status = check_service.apply_guardrail(latex, analysis)
                if not hint.strip() and status != "all_correct":
                    status = "all_correct"
                resp = CheckResponse(latex=latex, hint=hint, step_index=step_index, status=status)

        log_store.record(image_hash=image_hash, latex=latex, hint=resp.hint,
                         status=resp.status, step_index=resp.step_index)
        return resp

    except FileTooLargeError:
        # Bubble up to the registered EuraError handler -> 413.
        raise
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
