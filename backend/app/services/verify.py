"""Symbolic verification — independently re-check the LLM's step analysis.

If SymPy can parse all consecutive steps and finds a transition where the
algebra doesn't preserve equivalence, that's the ground-truth first error.
We trust SymPy over the LLM when both have an opinion (and SymPy can decide).
"""
from __future__ import annotations

import logging
from typing import Optional

from sympy import Eq, simplify

logger = logging.getLogger(__name__)


def _parse(latex: str):
    """Best-effort LaTeX -> SymPy. Returns None on any failure."""
    try:
        from latex2sympy2_extended import latex2sympy  # heavy import — keep lazy
        return latex2sympy(latex.strip())
    except Exception as e:
        logger.debug("latex2sympy failed on %r: %s", latex, e)
        return None


def _equiv(a, b) -> Optional[bool]:
    """Are two parsed steps algebraically equivalent? None if undecidable.

    For equations A=B and C=D, equivalent iff (A-B) is a non-zero constant
    multiple of (C-D). A pure-difference check would only catch add/subtract
    moves; the ratio check also covers multiply/divide both sides.
    """
    try:
        if isinstance(a, Eq) and isinstance(b, Eq):
            ea = simplify(a.lhs - a.rhs)
            eb = simplify(b.lhs - b.rhs)
            if ea == 0 and eb == 0:
                return True
            if ea == 0 or eb == 0:
                return False
            ratio = simplify(ea / eb)
            return bool(ratio.is_number) and ratio != 0
        if not isinstance(a, Eq) and not isinstance(b, Eq):
            return simplify(a - b) == 0
        # Mixed equation/expression — comparison is ambiguous.
        return None
    except Exception as e:
        logger.debug("simplify failed comparing %r and %r: %s", a, b, e)
        return None


def first_invalid_step(steps_latex: list[str]) -> Optional[int]:
    """Index of the first step whose transition from the previous step breaks
    algebraic equivalence. Returns None when all transitions are valid OR the
    verifier can't decide (parse failure, mixed types). Index 0 is never
    returned — the first step has nothing to compare against."""
    if len(steps_latex) < 2:
        return None
    parsed = [_parse(s) for s in steps_latex]
    if any(p is None for p in parsed):
        return None
    for i in range(1, len(parsed)):
        eq = _equiv(parsed[i - 1], parsed[i])
        if eq is False:
            return i
        if eq is None:
            return None  # bail to avoid false positives
    return None


def is_definitely_all_correct(steps_latex: list[str]) -> bool:
    """Returns True only when SymPy successfully parsed ALL steps and every
    consecutive transition is algebraically valid. False in all other cases
    (error found, parse failure, ambiguous comparison, fewer than 2 steps)."""
    if len(steps_latex) < 2:
        return False
    parsed = [_parse(s) for s in steps_latex]
    if any(p is None for p in parsed):
        return False
    for i in range(1, len(parsed)):
        if _equiv(parsed[i - 1], parsed[i]) is not True:
            return False
    return True
