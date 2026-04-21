import logging
import os

from dotenv import find_dotenv, load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# Load .env before importing modules that read env vars at import time.
load_dotenv(find_dotenv(usecwd=True))

from app.limiter import limiter  # noqa: E402
from app.routes import chat, check  # noqa: E402

logging.basicConfig(level=logging.INFO)


app = FastAPI(title="EuraAI")

# CORS: comma-separated origins via env, falls back to local Vite dev.
_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(check.router, prefix="/api")
app.include_router(chat.router, prefix="/api")


@app.get("/api/health")
async def health() -> dict[str, bool]:
    return {"ok": True}
