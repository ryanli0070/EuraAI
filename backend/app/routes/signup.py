"""Waitlist signup endpoint for the marketing site.
Stores normalized emails in SQLite. Idempotent: re-submitting the same email
returns 200 with already_subscribed=true rather than an error, so the UI can
show the same success state either way."""
from __future__ import annotations

import logging
import re
import sqlite3

from fastapi import APIRouter, Request

from app.errors import EuraError
from app.limiter import limiter
from app.schemas import SignupRequest, SignupResponse
from app.storage import signup_store

logger = logging.getLogger(__name__)

router = APIRouter()

# Pragmatic email check — matches the HTML5 input[type=email] grammar closely
# enough for our needs. We're not the canonical authority on what's valid;
# bouncing addresses are handled at send time.
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_MAX_EMAIL_LEN = 254  # RFC 5321


class InvalidEmailError(EuraError):
    status_code = 400
    detail = "Please enter a valid email address."


@router.post("/signup", response_model=SignupResponse)
@limiter.limit("10/minute")
async def signup(request: Request, body: SignupRequest) -> SignupResponse:
    email = body.email.strip().lower()
    if not email or len(email) > _MAX_EMAIL_LEN or not _EMAIL_RE.match(email):
        raise InvalidEmailError()

    try:
        is_new = signup_store.add(email, source=body.source)
    except sqlite3.Error:
        logger.exception("signup db write failed")
        raise EuraError("Could not save your email — please try again in a moment.")

    if is_new:
        logger.info("waitlist signup recorded")
    return SignupResponse(ok=True, already_subscribed=not is_new)
