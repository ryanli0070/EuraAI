"""Validate Supabase access tokens on protected routes.

Supabase signs access tokens with the project's JWT signing keys. Newer
projects default to asymmetric keys (ES256) published via JWKS; older projects
use a shared HS256 secret. Both are supported here — the token header's `alg`
selects the verification path:

  * ES256 / RS256 / PS256  -> fetch the matching public key from the project's
    JWKS endpoint (cached by PyJWKClient) and verify against it.
  * HS256                  -> verify against SUPABASE_JWT_SECRET.

`get_current_user` is a FastAPI dependency that returns the auth.users.id UUID
for the caller and stores it on `request.state.user_id` so the slowapi key
function can use it for per-user throttling.
"""
from __future__ import annotations

import logging

import jwt
from fastapi import Header, HTTPException, Request, status
from jwt import PyJWKClient

from app import config

logger = logging.getLogger(__name__)

# Created lazily so an HS256-only deployment never reaches for the network. The
# client caches the fetched key set (PyJWKClient default lifespan) and refetches
# automatically when keys rotate.
_jwk_client: PyJWKClient | None = None


def _jwks_client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        _jwk_client = PyJWKClient(config.SUPABASE_JWKS_URL)
    return _jwk_client


def _decode(token: str) -> dict:
    # The header's alg tells us how the project signs tokens. Asymmetric
    # (ES/RS/PS) -> verify against the JWKS public key for the token's `kid`;
    # HS256 -> the shared secret.
    alg = jwt.get_unverified_header(token).get("alg", "")
    if alg.startswith(("ES", "RS", "PS")):
        key = _jwks_client().get_signing_key_from_jwt(token).key
        algorithms = [alg]
    else:
        key = config.SUPABASE_JWT_SECRET
        algorithms = ["HS256"]
    return jwt.decode(
        token,
        key,
        algorithms=algorithms,
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
    except (jwt.InvalidTokenError, jwt.PyJWKClientError) as exc:
        # Don't echo the exception text to the client — it can leak structure.
        logger.warning("rejected token: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload.get("sub")
    if not isinstance(user_id, str) or not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing sub")

    request.state.user_id = user_id
    return user_id
