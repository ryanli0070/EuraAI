import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# Import config first — it loads .env and validates required env vars at
# startup, so the app crashes loudly if (e.g.) OPENAI_API_KEY is missing
# rather than returning 500s on the first request.
from app import config
from app.errors import EuraError, eura_error_handler
from app.limiter import limiter
from app.routes import chat, check, help

logging.basicConfig(level=logging.INFO)


app = FastAPI(title="EuraAI")

# CORS: explicit origins from env (prod). The regex also lets Vite's fallback
# ports (5174, 5175, …) work in dev when the canonical port is taken.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_exception_handler(EuraError, eura_error_handler)

app.include_router(check.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(help.router, prefix="/api")


@app.get("/api/health")
async def health() -> dict[str, bool]:
    return {"ok": True}
