"""Detect tutor-voice answer leaks in LLM-generated hints."""
from __future__ import annotations

import re

# Targets tutor-voice assertions ("the answer is", "should be N") which never
# appear in a well-formed Socratic hint. Bare "x = N" is intentionally NOT
# matched — the prompt requires the hint to quote the student's own (wrong)
# step verbatim, which would trip that pattern.
_LEAK_PATTERNS = [
    re.compile(r"\bequals?\s+-?\d+(\.\d+)?", re.IGNORECASE),
    re.compile(r"\banswer\s+is\b", re.IGNORECASE),
    re.compile(r"\bshould\s+(?:be|equal)\s+-?\d+(\.\d+)?", re.IGNORECASE),
    re.compile(r"\bcorrect\s+(?:answer|value)\s+is\b", re.IGNORECASE),
    re.compile(r"\bthe\s+right\s+(?:answer|value)\b", re.IGNORECASE),
]


def hint_leaks_answer(hint: str) -> bool:
    return any(p.search(hint) for p in _LEAK_PATTERNS)
