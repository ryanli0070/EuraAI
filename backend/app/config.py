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


def _float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise RuntimeError(f"Env var {name}={raw!r} must be a float") from exc


# OpenAI
OPENAI_API_KEY: Final[str] = _require("OPENAI_API_KEY")
OPENAI_MODEL: Final[str] = os.getenv("OPENAI_MODEL", "gpt-5.5")
# Reasoning effort for GPT-5+ models: none | low | medium | high | xhigh.
# Per-flow, because the flows differ in difficulty: the image flows (Check/Help)
# do OCR + multi-step analysis and default to "medium"; the text-only followup
# chat is lighter and stays "low" for snappier replies. ANALYSIS is bumped to
# ESCALATED on the reactive-escalation retry (see routes/check.py). OPENAI_REASONING_EFFORT
# remains the global fallback so a single env var can still override everything.
OPENAI_REASONING_EFFORT: Final[str] = os.getenv("OPENAI_REASONING_EFFORT", "low")
REASONING_EFFORT_ANALYSIS: Final[str] = os.getenv("OPENAI_REASONING_EFFORT_ANALYSIS", "medium")
REASONING_EFFORT_FOLLOWUP: Final[str] = os.getenv("OPENAI_REASONING_EFFORT_FOLLOWUP", OPENAI_REASONING_EFFORT)
REASONING_EFFORT_ESCALATED: Final[str] = os.getenv("OPENAI_REASONING_EFFORT_ESCALATED", "high")
# Below this model-reported confidence, re-run Check once at ESCALATED effort
# before trusting the verdict. The few-shots sit at 0.93-0.99, so 0.75 catches
# genuinely-unsure reads without escalating the routine confident ones.
ESCALATION_CONFIDENCE_THRESHOLD: Final[float] = _float_env("ESCALATION_CONFIDENCE_THRESHOLD", 0.75)


def _is_reasoning_model() -> bool:
    return OPENAI_MODEL.startswith(("gpt-5", "o1", "o3", "o4"))


def model_call_kwargs(
    temperature: float,
    cache_key: str | None = None,
    reasoning_effort: str | None = None,
) -> dict:
    """Per-model request kwargs for chat/parse calls.

    Reasoning models (GPT-5+ / o-series) reject a custom `temperature` — only the
    default (1) is allowed — and instead take `reasoning_effort`. Non-reasoning
    models (e.g. gpt-4o) take `temperature` and have no reasoning knob. Routing
    the per-call temperature through here keeps every call site working whether
    OPENAI_MODEL is a reasoning model or rolled back to gpt-4o.

    `reasoning_effort` overrides the per-flow effort for this one call (e.g. the
    escalation retry); it's ignored on non-reasoning models. Falls back to the
    global OPENAI_REASONING_EFFORT when a caller passes nothing.

    `cache_key` -> OpenAI's `prompt_cache_key`. OpenAI caches identical prompt
    prefixes (>=1024 tokens) automatically and bills the cached portion at a deep
    discount with lower latency; our system prompt + few-shots prefix is the same
    on every call, so it already qualifies. Passing a stable per-flow key only
    *routes* same-prefix requests to the same backend, raising the hit rate — it
    never changes the response. Use one key per distinct static prefix."""
    if _is_reasoning_model():
        kwargs: dict = {"reasoning_effort": reasoning_effort or OPENAI_REASONING_EFFORT}
    else:
        kwargs = {"temperature": temperature}
    if cache_key:
        kwargs["prompt_cache_key"] = cache_key
    return kwargs

# Supabase — used to validate access tokens on protected routes.
# SUPABASE_URL derives the JWKS endpoint for asymmetric (ES256/RS256) tokens,
# which is how new Supabase projects sign access tokens by default.
# SUPABASE_JWT_SECRET is the legacy shared secret, kept only as the HS256
# fallback (Settings -> API -> JWT secret). The token header's `alg` selects
# which path app/auth.py uses.
SUPABASE_URL: Final[str] = _require("SUPABASE_URL").rstrip("/")
SUPABASE_JWKS_URL: Final[str] = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
SUPABASE_JWT_SECRET: Final[str] = _require("SUPABASE_JWT_SECRET")

# Service-role key (full admin; bypasses RLS). Optional so the app still boots
# without it — only the account-deletion endpoint needs it, and that endpoint
# returns 503 when it's unset. NEVER expose this to the browser.
SUPABASE_SERVICE_ROLE_KEY: Final[str] = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

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
