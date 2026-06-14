"""
Dashboard aggregates — efficient Supabase count queries (no full table scans).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.database import get_supabase
from backend.services.storage_service import MEETING_LIST_COLUMNS

# Statuses counted as "pending" for dashboard KPIs
PENDING_TASK_STATUSES = ("open", "in_progress")
RECENT_MEETINGS_LIMIT = 5


def _count_rows(table: str, *, column: str = "id", filters: Optional[Dict[str, Any]] = None) -> int:
    """
    Head-only count query — returns total rows matching optional filters.

    Uses PostgREST count=exact so Supabase does not transfer row payloads.
    """
    query = get_supabase().table(table).select(column, count="exact", head=True)
    if filters:
        for key, value in filters.items():
            if key.endswith("_in") and isinstance(value, (list, tuple)):
                field = key[:-3]
                query = query.in_(field, list(value))
            else:
                query = query.eq(key, value)
    response = query.execute()
    return int(response.count or 0)


def fetch_dashboard_stats() -> Dict[str, Any]:
    """
    Build dashboard KPIs and 5 most recent meetings in one service call.
    """
    stats = {
        "total_meetings": _count_rows("meetings"),
        "total_tasks": _count_rows("action_items"),
        "completed_tasks": _count_rows("action_items", filters={"status": "completed"}),
        "pending_tasks": _count_rows(
            "action_items",
            filters={"status_in": PENDING_TASK_STATUSES},
        ),
        "total_decisions": _count_rows("decisions"),
        "total_risks": _count_rows("risks"),
    }

    response = (
        get_supabase()
        .table("meetings")
        .select(MEETING_LIST_COLUMNS)
        .order("created_at", desc=True)
        .limit(RECENT_MEETINGS_LIMIT)
        .execute()
    )
    recent_meetings = list(response.data or [])

    return {"stats": stats, "recent_meetings": recent_meetings}
