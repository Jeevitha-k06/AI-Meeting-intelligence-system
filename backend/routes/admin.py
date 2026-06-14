"""
Admin dashboard endpoints.
Only callable by users with role = owner | admin.
"""

from __future__ import annotations

import traceback

from fastapi import APIRouter, HTTPException, Query

from backend.config import get_settings
from backend.database import get_supabase
from backend.services.admin_service import fetch_admin_report

router = APIRouter(prefix="/admin", tags=["Admin"])


def _verify_admin(team_id: str, user_id: str) -> None:
    """
    Raise 403 if user_id is not owner/admin in team_id.
    Uses service-role key — bypasses RLS.
    """
    resp = (
        get_supabase()
        .table("team_members")
        .select("role")
        .eq("team_id", team_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        raise HTTPException(status_code=403, detail="Not a member of this team.")
    role = rows[0]["role"]
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Admin or owner role required.")


@router.get("/report/{team_id}")
def get_admin_report(
    team_id: str,
    user_id: str = Query(..., description="Caller's auth.users UUID for role verification"),
):
    """
    Return full admin dashboard data for team_id.
    Verifies caller is owner or admin before responding.
    """
    settings = get_settings()
    try:
        settings.validate_supabase()
        _verify_admin(team_id, user_id)
        data = fetch_admin_report(team_id)
        print(
            f"[admin] report: team={team_id} members={data['overview']['total_members']} "
            f"tasks={data['overview']['total_tasks']}"
        )
        return {"success": True, **data}
    except HTTPException:
        raise
    except Exception as exc:
        detail = str(exc)
        if settings.debug:
            detail = f"{detail}\n{traceback.format_exc()}"
        raise HTTPException(status_code=500, detail=f"Admin report failed: {detail}") from exc
