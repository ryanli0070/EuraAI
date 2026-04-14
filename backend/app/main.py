"""FastAPI application entry point."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.check import router as check_router

app = FastAPI(title="EuraAI", version="0.1.0")

# Dev: allow Vite dev server. Tighten before production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(check_router, prefix="/api")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
