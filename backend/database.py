"""
Supabase database client — single shared connection for the API.

Why this file exists:
  - Routes and services should not create their own Supabase clients.
  - One module = one place to configure retries, logging, or mocks later.

How the backend talks to Supabase:
  1. config.py reads SUPABASE_URL and SUPABASE_KEY from .env
  2. create_client() builds the supabase-py client
  3. services (e.g. save meeting results) call supabase.table("meetings").insert(...)

The database is hosted on Supabase (managed PostgreSQL). Tables are defined
in supabase_schema.sql at the project root.
"""

from __future__ import annotations

from typing import Optional

from supabase import Client, create_client

from backend.config import get_settings

# Module-level client — initialized lazily on first use
_supabase_client: Optional[Client] = None


def get_supabase() -> Client:
    """
    Return the shared Supabase client (lazy initialization).

    Example (future service code):
        from backend.database import supabase
        supabase.table("meetings").select("*").eq("id", meeting_id).execute()
    """
    global _supabase_client
    if _supabase_client is None:
        settings = get_settings()
        settings.validate_supabase()
        _supabase_client = create_client(settings.supabase_url, settings.supabase_key)
    return _supabase_client


class _SupabaseProxy:
    """Allows `from backend.database import supabase` without eager connect at import."""

    def __getattr__(self, name: str):
        return getattr(get_supabase(), name)


supabase = _SupabaseProxy()
