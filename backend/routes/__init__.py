"""
HTTP route modules (API endpoints).

Each file groups related endpoints:
  - health.py     → liveness checks
  - upload.py     → transcript upload + pipeline
  - meetings.py   → list meetings for dashboard

Routers are registered in main.py via app.include_router(...).
"""

from backend.routes.dashboard import router as dashboard_router
from backend.routes.health import router as health_router
from backend.routes.meetings import router as meetings_router
from backend.routes.tasks import router as tasks_router
from backend.routes.upload import router as upload_router
from backend.routes.search import router as search_router
from backend.routes.teams import router as teams_router
from backend.routes.admin import router as admin_router

__all__ = [
    "health_router",
    "upload_router",
    "meetings_router",
    "tasks_router",
    "dashboard_router",
    "search_router",
    "teams_router",
    "admin_router",
]
