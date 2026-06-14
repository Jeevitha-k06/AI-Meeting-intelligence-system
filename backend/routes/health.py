"""
Health and status routes.

Used by:
  - Developers checking the API is running
  - Future load balancers / deployment probes
"""

from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get("/")
def root_health() -> dict:
    """
    Root health check — confirms the FastAPI app is running.

    Does not test Supabase connectivity (add /health/db later if needed).
    """
    return {"status": "SyncSpace AI backend running"}
