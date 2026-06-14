"""
SyncSpace AI — FastAPI application entry point.

Run from project root (ML project/):
    uvicorn backend.main:app --reload

Or:
    python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

Architecture:
  main.py       → creates app, CORS, registers routers
  routes/       → HTTP endpoints (thin controllers)
  services/     → business logic + ML pipeline orchestration (later)
  database.py   → Supabase client
  config.py     → environment variables
  utils/        → helpers
  uploads/      → stored transcript files (later)
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import get_settings
from backend.routes import (
    dashboard_router,
    health_router,
    meetings_router,
    search_router,
    tasks_router,
    teams_router,
    admin_router,
    upload_router,
)
from backend.utils.paths import ensure_uploads_dir


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: ensure upload folder exists.
    Shutdown: add cleanup here if needed (close connections, etc.).
    """
    ensure_uploads_dir()
    yield


def create_app() -> FastAPI:
    """Application factory — used by uvicorn and tests."""
    settings = get_settings()

    app = FastAPI(
        title=settings.app_title,
        description=(
            "REST API for SyncSpace AI meeting intelligence. "
            "Wraps the existing NLP pipeline and stores results in Supabase."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS — allows a future React/Next.js dashboard to call this API
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register route modules
    app.include_router(health_router)
    app.include_router(upload_router)
    app.include_router(meetings_router)
    app.include_router(tasks_router)
    app.include_router(dashboard_router)
    app.include_router(search_router)
    app.include_router(teams_router)
    app.include_router(admin_router)

    return app


# Uvicorn looks for this object: backend.main:app
app = create_app()
