"""
Bridge between FastAPI and the existing ml_workspace NLP pipeline.

The ML code lives in ml_workspace/ — we only import run_pipeline_from_text()
and map its export payload into a simple dict for storage_service.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List

from backend.config import ML_WORKSPACE_DIR


def _ensure_ml_workspace_on_path() -> None:
    """Allow `from run_pipeline import ...` without changing ml_workspace package layout."""
    ml_path = str(ML_WORKSPACE_DIR.resolve())
    if ml_path not in sys.path:
        sys.path.insert(0, ml_path)


def run_meeting_pipeline(transcript: str, *, source_label: str) -> Dict[str, Any]:
    """
    Run existing SyncSpace AI pipeline on raw transcript text.

    Returns a flat dict for the API and Supabase:
      summary (str), action_items, decisions, risks, topic_clusters
    """
    _ensure_ml_workspace_on_path()

    # Import after path setup — avoids importing heavy ML libs at app startup
    from run_pipeline import run_pipeline_from_text  # noqa: WPS433

    payload = run_pipeline_from_text(
        transcript,
        source_label=source_label,
        quiet=True,
    )
    return normalize_pipeline_results(payload)


def normalize_pipeline_results(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert export payload from run_pipeline into API/storage shape.

    Risks come from summarizer major_risks (not a separate ML stage).
    """
    summary_block = payload.get("summary") or {}
    executive = (summary_block.get("executive_summary") or "").strip()
    if not executive and summary_block:
        executive = str(summary_block)

    risks: List[str] = list(summary_block.get("major_risks") or [])

    return {
        "summary": executive,
        "summary_full": summary_block,
        "action_items": payload.get("action_items") or [],
        "decisions": payload.get("decisions") or [],
        "risks": risks,
        "topic_clusters": payload.get("topic_clusters") or [],
        "metrics": payload.get("metrics") or {},
    }
