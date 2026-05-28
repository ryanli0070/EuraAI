"""Validate Supabase access tokens on protected routes.

Supabase signs JWTs with the project's JWT secret (HS256 by default). The
[crypto] extra on PyJWT also covers asymmetric algorithms, so this can be
swapped to JWKS without breaking callers if the project ever enables JWT
signing keys.

`get_current_user` is a FastAPI dependency that returns the auth.users.id
UUID for the caller and stores it on `request.state.user_id` so the
slowapi key function can use it for per-user throttling.
"""
from __future__ import annotations

import logging

import jwt
from fastapi import Header, HTTPException, Request, status

from app import config

logger = logging.getLogger(__name__)


def _decode(token: str) -> dict:
    return jwt.decode(
        token,
        config.SUPABASE_JWT_SECRET,
        algorithms=["HS256"],
        audience="authenticated",
    )


async def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = _decode(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError as exc:
        # Don't echo the exception text to the client — it can leak structure.
        logger.warning("rejected token: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload.get("sub")
    if not isinstance(user_id, str) or not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing sub")

    request.state.user_id = user_id
    return user_id
