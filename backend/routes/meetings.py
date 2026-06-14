"""
Meeting endpoints — list and detail views for dashboard.
"""

from __future__ import annotations

import traceback

from fastapi import APIRouter, HTTPException

from backend.config import get_settings
from backend.schemas import (
    ActionItemRecord,
    DecisionRecord,
    MeetingDetail,
    MeetingDetailResponse,
    MeetingListItem,
    MeetingsListResponse,
    RiskRecord,
    TopicClusterRecord,
)
from backend.services import storage_service

router = APIRouter(tags=["Meetings"])


@router.get("/meetings", response_model=MeetingsListResponse)
def list_meetings() -> MeetingsListResponse:
    """
    Fetch all meetings from Supabase, newest first.

    Returns id, title, summary, processing_status, uploaded_file_name, created_at.
    """
    settings = get_settings()

    try:
        settings.validate_supabase()
        rows = storage_service.fetch_all_meetings()
        meetings = [MeetingListItem(**row) for row in rows]
        print(f"[meetings] Fetched {len(meetings)} meeting(s) from Supabase")
        return MeetingsListResponse(success=True, count=len(meetings), meetings=meetings)

    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        detail = str(exc)
        if settings.debug:
            detail = f"{detail}\n{traceback.format_exc()}"
        print(f"[meetings] Error fetching meetings: {detail}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch meetings: {detail}",
        ) from exc


@router.delete("/meetings/{meeting_id}", status_code=200)
def delete_meeting(meeting_id: str):
    """
    Delete a meeting and all its related NLP outputs (action_items, decisions, risks, topic_clusters).
    Relies on ON DELETE CASCADE in Supabase schema.
    """
    settings = get_settings()
    try:
        settings.validate_supabase()
        deleted = storage_service.delete_meeting(meeting_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"Meeting not found: {meeting_id}")
        print(f"[meetings] Deleted meeting {meeting_id}")
        return {"success": True, "message": "Meeting deleted"}
    except HTTPException:
        raise
    except Exception as exc:
        detail = str(exc)
        if settings.debug:
            detail = f"{detail}\n{traceback.format_exc()}"
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete meeting: {detail}",
        ) from exc


@router.get("/meetings/{meeting_id}", response_model=MeetingDetailResponse)
def get_meeting_detail(meeting_id: str) -> MeetingDetailResponse:
    """
    Fetch one meeting and all related NLP outputs by meeting_id.
    """
    settings = get_settings()

    try:
        settings.validate_supabase()
        bundle = storage_service.fetch_meeting_detail_bundle(meeting_id)

        if bundle is None:
            raise HTTPException(
                status_code=404,
                detail=f"Meeting not found: {meeting_id}",
            )

        print(
            f"[meetings] Fetched detail for {meeting_id}: "
            f"{len(bundle['action_items'])} actions, "
            f"{len(bundle['decisions'])} decisions, "
            f"{len(bundle['risks'])} risks, "
            f"{len(bundle['topic_clusters'])} clusters"
        )

        return MeetingDetailResponse(
            success=True,
            meeting=MeetingDetail(**bundle["meeting"]),
            action_items=[ActionItemRecord(**row) for row in bundle["action_items"]],
            decisions=[DecisionRecord(**row) for row in bundle["decisions"]],
            risks=[RiskRecord(**row) for row in bundle["risks"]],
            topic_clusters=[TopicClusterRecord(**row) for row in bundle["topic_clusters"]],
        )

    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        detail = str(exc)
        if settings.debug:
            detail = f"{detail}\n{traceback.format_exc()}"
        print(f"[meetings] Error fetching meeting {meeting_id}: {detail}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch meeting detail: {detail}",
        ) from exc
