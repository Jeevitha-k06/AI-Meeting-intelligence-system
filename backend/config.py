"""
Application configuration loaded from environment variables.

Why this file exists:
  - Keeps secrets (Supabase URL/key) out of source code.
  - Single place to read settings for database.py, routes, and services.

Usage:
  from backend.config import get_settings
  settings = get_settings()
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# backend/ directory (this file lives here)
BACKEND_DIR = Path(__file__).resolve().parent
# Project root: ML project/ (parent of backend/)
PROJECT_ROOT = BACKEND_DIR.parent
# Where uploaded transcript files will be stored (created on first use)
UPLOADS_DIR = BACKEND_DIR / "uploads"
# Existing NLP pipeline folder — do not modify; only called from services later
ML_WORKSPACE_DIR = PROJECT_ROOT / "ml_workspace"

# Load .env BEFORE any os.getenv() — backend/.env first, then project root
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")
# Also load from cwd when uvicorn starts from another directory
load_dotenv()

# Temporary startup debug — remove or set DEBUG=false once env is confirmed
print("SUPABASE_URL:", os.getenv("SUPABASE_URL"))
print("SUPABASE_KEY EXISTS:", bool(os.getenv("SUPABASE_KEY")))
print("SUPABASE_SERVICE_KEY EXISTS:", bool(os.getenv("SUPABASE_SERVICE_KEY")))
if os.getenv("SUPABSE_KEY"):
    print("[WARNING] Found SUPABSE_KEY in .env — typo; rename to SUPABASE_KEY")


class Settings:
    """
    Simple settings container for the student project.

    SUPABASE_URL: Your project URL from Supabase Dashboard → Settings → API.
    SUPABASE_KEY: Use the **service_role** key for server-side backend writes
                  (never expose service_role in frontend). For early testing
                  you may use anon key if RLS policies allow it.
    """

    def __init__(self) -> None:
        self.supabase_url: str = _normalize_supabase_url(os.getenv("SUPABASE_URL", ""))
        self.supabase_key: str = _read_supabase_key()

        # CORS: comma-separated origins, e.g. http://localhost:3000,http://localhost:5173
        origins_raw = os.getenv("CORS_ORIGINS", "*").strip()
        self.cors_origins: list[str] = (
            ["*"]
            if origins_raw == "*"
            else [o.strip() for o in origins_raw.split(",") if o.strip()]
        )

        self.app_title: str = os.getenv("APP_TITLE", "SyncSpace AI API")
        self.debug: bool = os.getenv("DEBUG", "true").lower() in ("1", "true", "yes")

        # Required for meetings.team_id — create a team in Supabase, copy its UUID here
        self.default_team_id: str = os.getenv("DEFAULT_TEAM_ID", "").strip()

    def validate_supabase(self) -> None:
        """Raise clear error if Supabase env vars are missing."""
        missing = []
        if not self.supabase_url:
            missing.append("SUPABASE_URL")
        if not self.supabase_key:
            missing.append("SUPABASE_KEY")
        if missing:
            raise ValueError(
                f"Missing required environment variables: {', '.join(missing)}. "
                f"Copy backend/.env.example to backend/.env and fill in values."
            )


def _read_supabase_key() -> str:
    """
    Backend expects SUPABASE_KEY (service_role or anon for demos).

    Also accepts SUPABASE_SERVICE_KEY if you prefer that name in .env.
    """
    for name in ("SUPABASE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
        value = os.getenv(name, "").strip()
        if value:
            return value
    # Common typo seen in student .env files
    typo = os.getenv("SUPABSE_KEY", "").strip()
    if typo:
        print("[WARNING] Using SUPABSE_KEY — fix .env: rename to SUPABASE_KEY")
        return typo
    return ""


def _normalize_supabase_url(url: str) -> str:
    """
    supabase-py needs the project URL, not the REST path.

    Dashboard → Settings → API → Project URL:
      https://xxxx.supabase.co
    """
    u = (url or "").strip().rstrip("/")
    if u.endswith("/rest/v1"):
        u = u[: -len("/rest/v1")]
    return u


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance — loaded once per process."""
    return Settings()
