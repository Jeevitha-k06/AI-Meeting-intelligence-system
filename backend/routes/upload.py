"""
POST /upload-meeting — upload transcript, run NLP pipeline, save to Supabase.
"""

from __future__ import annotations

import traceback
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.config import get_settings
from backend.services import file_service, pipeline_service, storage_service

router = APIRouter(tags=["Meetings"])


@router.post("/upload-meeting")
async def upload_meeting(
    file: UploadFile = File(..., description="Transcript file (.txt, .pdf, .docx)"),
    title: str | None = Form(None, description="Meeting title (defaults to filename)"),
    team_id: str | None = Form(None, description="Supabase team UUID (or set DEFAULT_TEAM_ID)"),
):
    """
    Full upload → extract → NLP pipeline → Supabase flow.

    1. Save file to backend/uploads/
    2. Extract plain text
    3. Create meeting row (pending)
    4. Run ml_workspace pipeline
    5. Save summary, actions, decisions, risks, clusters
    6. Return JSON summary for dashboard / demo
    """
    settings = get_settings()
    resolved_team_id = (team_id or settings.default_team_id or "").strip()
    if not resolved_team_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "team_id is required. Pass it as a form field or set DEFAULT_TEAM_ID in backend/.env. "
                "Create a team in Supabase (public.teams) first."
            ),
        )

    meeting_id: str | None = None
    saved_path: Path | None = None

    try:
        settings.validate_supabase()
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    try:
        saved_path, stored_name = await file_service.save_uploaded_file(file)
        transcript = file_service.extract_text_from_file(saved_path)

        meeting_title = (title or "").strip() or Path(file.filename or "Meeting").stem

        meeting_id = storage_service.create_meeting(
            team_id=resolved_team_id,
            title=meeting_title,
            transcript_text=transcript,
            uploaded_file_name=stored_name,
        )
        storage_service.update_meeting_status(meeting_id, "processing")

        results = pipeline_service.run_meeting_pipeline(
            transcript,
            source_label=stored_name,
        )
        counts = storage_service.save_all_pipeline_results(
            meeting_id,
            results,
            team_id=resolved_team_id,
        )

        return {
            "success": True,
            "meeting_id": meeting_id,
            "summary": results.get("summary") or "",
            "action_items_count": counts["action_items"],
            "decisions_count": counts["decisions"],
            "risks_count": counts["risks"],
            "topic_clusters_count": counts["topic_clusters"],
        }

    except ValueError as exc:
        if meeting_id:
            storage_service.mark_meeting_failed(meeting_id)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        if meeting_id:
            storage_service.mark_meeting_failed(meeting_id)
        detail = str(exc)
        if settings.debug:
            detail = f"{detail}\n{traceback.format_exc()}"
        raise HTTPException(
            status_code=500,
            detail=f"Processing failed: {detail}",
        ) from exc
