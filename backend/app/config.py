"""Centralized config. Reads env at import; raises on missing required vars
so the app crashes at startup instead of returning 500s on the first request."""
from __future__ import annotations

import os
from typing import Final

from dotenv import find_dotenv, load_dotenv

# Load .env once, before any module reads env vars.
load_dotenv(find_dotenv(usecwd=True))


def _require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Required env var {name} is not set")
    return value


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f"Env var {name}={raw!r} must be an integer") from exc


# OpenAI
OPENAI_API_KEY: Final[str] = _require("OPENAI_API_KEY")
OPENAI_MODEL: Final[str] = os.getenv("OPENAI_MODEL", "gpt-4o-2024-08-06")

# Supabase — used to validate access tokens on protected routes.
# SUPABASE_URL derives the JWKS endpoint for asymmetric (ES256/RS256) tokens,
# which is how new Supabase projects sign access tokens by default.
# SUPABASE_JWT_SECRET is the legacy shared secret, kept only as the HS256
# fallback (Settings -> API -> JWT secret). The token header's `alg` selects
# which path app/auth.py uses.
SUPABASE_URL: Final[str] = _require("SUPABASE_URL").rstrip("/")
SUPABASE_JWKS_URL: Final[str] = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
SUPABASE_JWT_SECRET: Final[str] = _require("SUPABASE_JWT_SECRET")

# Image preprocessing — vision API tiles billed by pixel count.
MAX_IMAGE_WIDTH: Final[int] = _int_env("MAX_IMAGE_WIDTH", 1600)

# Upload size cap for /check and /help. Whiteboard PNGs are typically 1–3 MB;
# 10 MB has headroom without inviting abuse.
MAX_UPLOAD_BYTES: Final[int] = _int_env("MAX_UPLOAD_BYTES", 10 * 1024 * 1024)

# CORS — comma-separated list. Dev fallback covers Vite's port shuffle and the
# Capacitor iOS wrapper, which uses a `capacitor://localhost` origin.
CORS_ORIGINS: Final[list[str]] = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,capacitor://localhost,https://localhost",
    ).split(",")
    if o.strip()
]
