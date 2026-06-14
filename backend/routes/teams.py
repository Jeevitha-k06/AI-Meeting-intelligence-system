"""
Team endpoints — member listing and role resolution for frontend assignment UI.
"""

from __future__ import annotations

import traceback

from fastapi import APIRouter, HTTPException, Query

from backend.config import get_settings
from backend.database import get_supabase
from backend.services.user_resolution import fetch_team_members

router = APIRouter(tags=["Teams"])


@router.get("/teams/{team_id}/members")
def list_team_members(team_id: str):
    """
    Return display_name + user_id for every member of the team.
    Used by the frontend task reassignment dropdown.
    """
    settings = get_settings()
    try:
        settings.validate_supabase()
        members = fetch_team_members(team_id)
        return {"success": True, "members": members}
    except Exception as exc:
        detail = str(exc)
        if settings.debug:
            detail = f"{detail}\n{traceback.format_exc()}"
        raise HTTPException(status_code=500, detail=f"Failed to fetch team members: {detail}") from exc


@router.get("/teams/{team_id}/my-role")
def get_my_role(team_id: str, user_id: str = Query(..., description="auth.users UUID of the caller")):
    """
    Return the caller's role in team_id.

    Uses the service-role key (bypasses RLS) so this works even when
    the anon client has no read policy on team_members.

    Returns: { "role": "owner" | "admin" | "member" | null }
    """
    settings = get_settings()
    try:
        settings.validate_supabase()
        response = (
            get_supabase()
            .table("team_members")
            .select("role")
            .eq("team_id", team_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        role = rows[0]["role"] if rows else None

        print(
            f"[teams] my-role: team_id={team_id} user_id={user_id} "
            f"rows_found={len(rows)} role={role!r}"
        )
        return {"success": True, "role": role}

    except Exception as exc:
        detail = str(exc)
        if settings.debug:
            detail = f"{detail}\n{traceback.format_exc()}"
        raise HTTPException(status_code=500, detail=f"Failed to fetch role: {detail}") from exc
