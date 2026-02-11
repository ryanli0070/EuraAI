"""FastAPI application entrypoint."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import init_db
from routers import health, examples, openai


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    # shutdown (e.g. close pools) can go here


app = FastAPI(
    title="EuraAI API",
    description="Backend API with database and OpenAI integration",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(examples.router)
app.include_router(openai.router)


@app.get("/")
async def root():
    return {"message": "EuraAI API", "docs": "/docs"}
