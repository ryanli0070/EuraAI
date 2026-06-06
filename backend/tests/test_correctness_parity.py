"""Parity tests: /api/check (hint mode) and /api/help (help mode) must reach
the same correctness verdict on the same input.

Strategy: patch the two LLM-calling service functions (check_image, help_image)
to return controlled TutorOutput / HelpOutput payloads, then POST to both
endpoints and compare the resulting `status` fields. The actual LLM is never
called — this isolates the route-level correctness logic from model variance.
"""
from __future__ import annotations

import io
from typing import Optional
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.llm.models import HelpOutput, Step, TutorOutput
from app.llm import prompts as P
from app.main import app


client = TestClient(app)


@pytest.fixture(autouse=True)
def _bypass_auth():
    """The /check and /help routes are auth-gated (added in the Supabase
    migration). These tests exercise route-level correctness logic, not auth,
    so override the dependency to a fixed test user and restore it after."""
    app.dependency_overrides[get_current_user] = lambda: "test-user-id"
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _steps(latex_lines: list[str], first_bad: Optional[int] = None) -> list[Step]:
    """Build a list of Step models matching the convention used in FEW_SHOTS:
    every step before first_bad is valid, the bad step is invalid, everything
    after propagates."""
    out: list[Step] = []
    for i, latex in enumerate(latex_lines):
        if first_bad is None:
            out.append(Step(latex=latex, valid=True, error_type=None))
        elif i < first_bad:
            out.append(Step(latex=latex, valid=True, error_type=None))
        elif i == first_bad:
            out.append(Step(latex=latex, valid=False, error_type="test_error"))
        else:
            out.append(Step(latex=latex, valid=False, error_type="propagated"))
    return out


def _tutor(latex_lines: list[str], all_correct: bool,
           first_error_index: Optional[int], hint: str) -> TutorOutput:
    return TutorOutput(
        steps=_steps(latex_lines, first_error_index if not all_correct else None),
        first_error_index=first_error_index,
        all_correct=all_correct,
        hint=hint,
        confidence=0.95,
    )


def _help(latex_lines: list[str], all_correct: bool,
          first_error_index: Optional[int], explanation: str) -> HelpOutput:
    return HelpOutput(
        steps=_steps(latex_lines, first_error_index if not all_correct else None),
        first_error_index=first_error_index,
        all_correct=all_correct,
        explanation=explanation,
        confidence=0.95,
    )


def _call_both(tutor_out: TutorOutput, help_out: HelpOutput) -> tuple[dict, dict]:
    """POST a dummy image to /api/check and /api/help with the two service
    functions patched to return the given canned outputs. Returns (check_json,
    help_json)."""
    fake_png = io.BytesIO(b"\x89PNG\r\n\x1a\nfake-image-bytes-for-test")

    with patch("app.routes.check.check_service.check_image", return_value=tutor_out), \
         patch("app.routes.check.check_service.apply_guardrail",
               wraps=__import__("app.services.check", fromlist=["apply_guardrail"]).apply_guardrail), \
         patch("app.routes.help.help_service.help_image", return_value=help_out):

        fake_png.seek(0)
        r1 = client.post("/api/check", files={"file": ("w.png", fake_png, "image/png")})
        fake_png.seek(0)
        r2 = client.post("/api/help", files={"file": ("w.png", fake_png, "image/png")})

    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text
    return r1.json(), r2.json()


# ---------------------------------------------------------------------------
# Structural parity: the two prompts and few-shot lists share correctness
# criteria verbatim, so the model sees identical instructions in both modes.
# ---------------------------------------------------------------------------

def test_prompts_share_correctness_blocks():
    for block in (P._TRANSCRIPTION_RULES, P._MULTI_PROBLEM_RULE, P._CORRECTNESS_STANDARD):
        assert block in P.SYSTEM_PROMPT, "hint prompt missing shared correctness block"
        assert block in P.HELP_SYSTEM_PROMPT, "help prompt missing shared correctness block"


def test_few_shots_share_correctness_labels():
    """Every few-shot example must have identical correctness fields across
    modes. Only the text field (hint vs explanation) is allowed to differ."""
    assert len(P.FEW_SHOTS) == len(P.HELP_FEW_SHOTS)
    for (uh, ah), (uhelp, ahelp) in zip(P.FEW_SHOTS, P.HELP_FEW_SHOTS):
        assert uh == uhelp, "few-shot user latex diverged"
        assert ah["steps"] == ahelp["steps"]
        assert ah["first_error_index"] == ahelp["first_error_index"]
        assert ah["all_correct"] == ahelp["all_correct"]
        assert ah["confidence"] == ahelp["confidence"]
        assert "hint" in ah and "explanation" in ahelp


# ---------------------------------------------------------------------------
# Behavioral parity at the route level. Each case feeds *the same* correctness
# inputs to both endpoints and asserts the verdict agrees.
# ---------------------------------------------------------------------------

CORRECT_STEPS = ["2x + 3 = 7", "2x = 4", "x = 2"]
WRONG_STEPS = ["2x + 3 = 7", "2x = 10", "x = 5"]
# SymPy can't parse the mixed substitution form, so is_definitely_all_correct
# returns False here; the LLM verdict is what decides.
SUBST_STEPS = ["y + 3x = 30", "30 - 3(4) = y", "y = 30 - 12", "y = 18"]


def test_case_A_sympy_overrides_both_llms_when_they_wrongly_flag_correct_work():
    """The original user-reported bug: both LLMs (hypothetically) say wrong,
    but the work is symbolically correct. With the SymPy override now in both
    routes, both must return all_correct."""
    tutor = _tutor(CORRECT_STEPS, all_correct=False, first_error_index=1,
                   hint="In $2x = 4$, does the previous step support this?")
    helpo = _help(CORRECT_STEPS, all_correct=False, first_error_index=1,
                  explanation="The step $2x = 4$ does not follow from the previous one.")
    check_resp, help_resp = _call_both(tutor, helpo)
    assert check_resp["status"] == "all_correct", check_resp
    assert help_resp["status"] == "all_correct", help_resp
    assert check_resp["status"] == help_resp["status"]


def test_case_B_both_llms_agree_correct_and_sympy_agrees():
    tutor = _tutor(CORRECT_STEPS, all_correct=True, first_error_index=None, hint="")
    helpo = _help(CORRECT_STEPS, all_correct=True, first_error_index=None,
                  explanation="Your work looks correct — every step follows from the previous one.")
    check_resp, help_resp = _call_both(tutor, helpo)
    assert check_resp["status"] == "all_correct"
    assert help_resp["status"] == "all_correct"


def test_case_C_both_llms_agree_wrong_and_sympy_agrees():
    tutor = _tutor(WRONG_STEPS, all_correct=False, first_error_index=1,
                   hint="In $2x = 10$, what operation did you apply to both sides?")
    helpo = _help(WRONG_STEPS, all_correct=False, first_error_index=1,
                  explanation="In $2x = 10$, you added 3 instead of subtracting. It should be $2x = 4$.")
    check_resp, help_resp = _call_both(tutor, helpo)
    assert check_resp["status"] == "ok"
    assert help_resp["status"] == "ok"
    # And both flag the same step index.
    assert check_resp["step_index"] == help_resp["step_index"] == 1


def test_case_D_sympy_undecidable_both_llms_say_correct():
    """SymPy bails (mixed substitution form); both LLMs return all_correct.
    Both routes must defer to the LLM and return all_correct."""
    tutor = _tutor(SUBST_STEPS, all_correct=True, first_error_index=None, hint="")
    helpo = _help(SUBST_STEPS, all_correct=True, first_error_index=None,
                  explanation="Your work looks correct — every step follows from the previous one.")
    check_resp, help_resp = _call_both(tutor, helpo)
    assert check_resp["status"] == "all_correct"
    assert help_resp["status"] == "all_correct"


def test_case_E_blank_canvas_both_return_no_math():
    tutor = TutorOutput(steps=[], first_error_index=None, all_correct=False,
                        hint="", confidence=0.0)
    helpo = HelpOutput(steps=[], first_error_index=None, all_correct=False,
                       explanation="I couldn't see any math on the canvas — try writing larger or darker.",
                       confidence=0.0)
    check_resp, help_resp = _call_both(tutor, helpo)
    assert check_resp["status"] == "no_math"
    assert help_resp["status"] == "no_math"


def test_case_F_asymmetric_llm_verdicts_but_sympy_breaks_the_tie():
    """Tutor says wrong, Help says correct, work is symbolically correct.
    Both must still land on all_correct — hint via SymPy override, help via
    LLM agreement (and also SymPy override). This is the hardest case for
    parity: the LLMs disagree, but the verdicts still match."""
    tutor = _tutor(CORRECT_STEPS, all_correct=False, first_error_index=1,
                   hint="In $2x = 4$, are you sure this follows?")
    helpo = _help(CORRECT_STEPS, all_correct=True, first_error_index=None,
                  explanation="Your work looks correct — every step follows from the previous one.")
    check_resp, help_resp = _call_both(tutor, helpo)
    assert check_resp["status"] == "all_correct", check_resp
    assert help_resp["status"] == "all_correct", help_resp
