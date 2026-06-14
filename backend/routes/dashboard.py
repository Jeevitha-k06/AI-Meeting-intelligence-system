"""
Dashboard overview — aggregate stats and recent meetings.
"""

from __future__ import annotations

import traceback

from fastapi import APIRouter, HTTPException

from backend.config import get_settings
from backend.schemas import DashboardStats, DashboardStatsResponse, MeetingListItem
from backend.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats() -> DashboardStatsResponse:
    """
    Return KPI counts and the 5 most recent meetings.

    Counts use head-only Supabase queries (no full table downloads).
    """
    settings = get_settings()

    try:
        settings.validate_supabase()
        payload = dashboard_service.fetch_dashboard_stats()
        stats = DashboardStats(**payload["stats"])
        recent = [MeetingListItem(**row) for row in payload["recent_meetings"]]

        print(
            f"[dashboard] stats: meetings={stats.total_meetings}, "
            f"tasks={stats.total_tasks}, decisions={stats.total_decisions}, "
            f"risks={stats.total_risks}"
        )

        return DashboardStatsResponse(
            success=True,
            stats=stats,
            recent_meetings=recent,
        )

    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        detail = str(exc)
        if settings.debug:
            detail = f"{detail}\n{traceback.format_exc()}"
        print(f"[dashboard] Error fetching stats: {detail}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch dashboard stats: {detail}",
        ) from exc
