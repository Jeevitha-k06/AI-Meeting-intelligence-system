"""
Persist meeting intelligence results to Supabase (PostgreSQL).

Tables (see supabase_schema.sql):
  meetings, action_items, decisions, risks, topic_clusters
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.database import get_supabase

# Columns returned by GET /meetings (dashboard list)
MEETING_LIST_COLUMNS = (
    "id, title, summary, processing_status, uploaded_file_name, created_at"
)


def fetch_all_meetings() -> List[dict]:
    """
    Load all meetings from Supabase, ordered by created_at descending (newest first).

    Returns list of dicts ready for MeetingListItem Pydantic models.
    """
    response = (
        get_supabase()
        .table("meetings")
        .select(MEETING_LIST_COLUMNS)
        .order("created_at", desc=True)
        .execute()
    )
    return list(response.data or [])


MEETING_DETAIL_COLUMNS = (
    "id, team_id, title, summary, processing_status, "
    "uploaded_file_name, transcript_text, created_at"
)


def fetch_meeting_by_id(meeting_id: str) -> Optional[dict]:
    """Return one meeting row or None if not found."""
    response = (
        get_supabase()
        .table("meetings")
        .select(MEETING_DETAIL_COLUMNS)
        .eq("id", meeting_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def fetch_action_items_by_meeting(meeting_id: str) -> List[dict]:
    response = (
        get_supabase()
        .table("action_items")
        .select("id, meeting_id, task, status, confidence, deadline, assigned_to, created_at")
        .eq("meeting_id", meeting_id)
        .order("created_at", desc=False)
        .execute()
    )
    return list(response.data or [])


def fetch_decisions_by_meeting(meeting_id: str) -> List[dict]:
    response = (
        get_supabase()
        .table("decisions")
        .select("id, meeting_id, decision_text, category, confidence, created_at")
        .eq("meeting_id", meeting_id)
        .order("created_at", desc=False)
        .execute()
    )
    return list(response.data or [])


def fetch_risks_by_meeting(meeting_id: str) -> List[dict]:
    response = (
        get_supabase()
        .table("risks")
        .select("id, meeting_id, risk_text, severity, created_at")
        .eq("meeting_id", meeting_id)
        .order("created_at", desc=False)
        .execute()
    )
    return list(response.data or [])


def fetch_topic_clusters_by_meeting(meeting_id: str) -> List[dict]:
    response = (
        get_supabase()
        .table("topic_clusters")
        .select("id, meeting_id, topic_name, coherence, keywords, created_at")
        .eq("meeting_id", meeting_id)
        .order("created_at", desc=False)
        .execute()
    )
    return list(response.data or [])


def fetch_meeting_detail_bundle(meeting_id: str) -> Optional[Dict[str, Any]]:
    """
    Load meeting plus all NLP result tables for GET /meetings/{meeting_id}.

    Returns None when meeting_id does not exist.
    """
    meeting = fetch_meeting_by_id(meeting_id)
    if not meeting:
        return None
    return {
        "meeting": meeting,
        "action_items": fetch_action_items_by_meeting(meeting_id),
        "decisions": fetch_decisions_by_meeting(meeting_id),
        "risks": fetch_risks_by_meeting(meeting_id),
        "topic_clusters": fetch_topic_clusters_by_meeting(meeting_id),
    }


def create_meeting(
    *,
    team_id: str,
    title: str,
    transcript_text: str,
    uploaded_file_name: str,
) -> str:
    """
    Insert a new meeting row with status 'pending'.
    Returns meeting UUID string.
    """
    row = {
        "team_id": team_id,
        "title": title,
        "transcript_text": transcript_text,
        "uploaded_file_name": uploaded_file_name,
        "processing_status": "pending",
    }
    response = get_supabase().table("meetings").insert(row).execute()
    data = response.data
    if not data:
        raise RuntimeError("Failed to create meeting record in Supabase.")
    return str(data[0]["id"])


def update_meeting_status(meeting_id: str, status: str) -> None:
    """Update processing_status: pending | processing | completed | failed."""
    get_supabase().table("meetings").update({"processing_status": status}).eq(
        "id", meeting_id
    ).execute()


def update_meeting_summary(meeting_id: str, summary: str, status: str = "completed") -> None:
    """Save executive summary and mark meeting complete."""
    get_supabase().table("meetings").update(
        {"summary": summary, "processing_status": status}
    ).eq("id", meeting_id).execute()


def delete_meeting(meeting_id: str) -> bool:
    """
    Delete a meeting and all its related NLP results.
    Cascades via ON DELETE CASCADE in Supabase schema (action_items, decisions, risks, topic_clusters).
    Returns True if the meeting row was found and deleted, False otherwise.
    """
    response = (
        get_supabase()
        .table("meetings")
        .delete()
        .eq("id", meeting_id)
        .execute()
    )
    return bool(response.data)


def mark_meeting_failed(meeting_id: str) -> None:
    update_meeting_status(meeting_id, "failed")


def save_action_items(
    meeting_id: str,
    action_items: List[dict],
    team_id: Optional[str] = None,
) -> int:
    """
    Persist action items with assigned_to UUID resolution and deadline parsing.

    Pipeline:
      1. Extract assignee name + deadline text from each action group
      2. Resolve assignee name → auth.users UUID via team_members (best-effort)
      3. Parse deadline string → ISO 8601 UTC timestamp
      4. Insert one DB row per task line with all fields populated
    """
    from backend.utils.date_parser import parse_deadline
    from backend.services.user_resolution import fetch_team_members, resolve_assignee_to_uuid

    # Load team members once for the whole batch (only if team_id provided)
    team_members = fetch_team_members(team_id) if team_id else []

    rows: List[dict] = []
    for group in action_items:
        raw_assignee: str = (
            group.get("assigned_to") or group.get("assignee") or ""
        ).strip()
        raw_deadline: str = (group.get("deadline") or "").strip()
        confidence = _clamp_confidence(group.get("confidence"))

        # ── Name → UUID resolution ──────────────────────────────────────────
        resolved_uuid: Optional[str] = None
        if raw_assignee and team_members:
            resolved_uuid = resolve_assignee_to_uuid(raw_assignee, team_members)

        # ── Deadline parsing ────────────────────────────────────────────────
        deadline_iso: Optional[str] = parse_deadline(raw_deadline)

        # ── Diagnostic log ──────────────────────────────────────────────────
        print(
            f"[action_items] assignee='{raw_assignee}' "
            f"resolved_uuid={resolved_uuid!r} "
            f"deadline_raw='{raw_deadline}' "
            f"deadline_iso={deadline_iso!r} "
            f"confidence={confidence}"
        )

        tasks = group.get("tasks") or []
        if not tasks and group.get("task"):
            tasks = [group["task"]]

        for task_text in tasks:
            if not str(task_text).strip():
                continue
            row: Dict[str, Any] = {
                "meeting_id": meeting_id,
                "task": str(task_text).strip(),
                "status": "open",
                "confidence": confidence,
            }
            if resolved_uuid:
                row["assigned_to"] = resolved_uuid
            if deadline_iso:
                row["deadline"] = deadline_iso

            print(f"[action_items] DB payload: {row}")
            rows.append(row)

    if not rows:
        return 0

    get_supabase().table("action_items").insert(rows).execute()
    return len(rows)


def save_decisions(meeting_id: str, decisions: List[dict]) -> int:
    rows = []
    for item in decisions:
        text = (item.get("decision") or "").strip()
        if not text:
            continue
        rows.append(
            {
                "meeting_id": meeting_id,
                "decision_text": text,
                "category": item.get("category"),
                "confidence": _clamp_confidence(item.get("confidence")),
            }
        )
    if not rows:
        return 0
    get_supabase().table("decisions").insert(rows).execute()
    return len(rows)


def save_risks(meeting_id: str, risks: List[str], severity: str = "medium") -> int:
    rows = []
    for risk in risks:
        text = str(risk).strip()
        if not text:
            continue
        rows.append(
            {
                "meeting_id": meeting_id,
                "risk_text": text,
                "severity": severity,
            }
        )
    if not rows:
        return 0
    get_supabase().table("risks").insert(rows).execute()
    return len(rows)


def save_topic_clusters(meeting_id: str, clusters: List[dict]) -> int:
    rows = []
    for cluster in clusters:
        name = (cluster.get("topic_name") or "Unnamed Topic").strip()
        keywords = cluster.get("keywords") or []
        if isinstance(keywords, str):
            keywords = [keywords]
        rows.append(
            {
                "meeting_id": meeting_id,
                "topic_name": name,
                "coherence": _clamp_confidence(cluster.get("coherence")),
                "keywords": keywords[:20],
            }
        )
    if not rows:
        return 0
    get_supabase().table("topic_clusters").insert(rows).execute()
    return len(rows)


def save_all_pipeline_results(
    meeting_id: str,
    results: Dict[str, Any],
    team_id: Optional[str] = None,
) -> Dict[str, int]:
    """
    Persist all NLP outputs and update meeting summary in one call.
    Returns counts per entity type.
    """
    summary_text = results.get("summary") or ""
    update_meeting_summary(meeting_id, summary_text, status="completed")

    counts = {
        "action_items": save_action_items(
            meeting_id,
            results.get("action_items") or [],
            team_id=team_id,
        ),
        "decisions": save_decisions(meeting_id, results.get("decisions") or []),
        "risks": save_risks(meeting_id, results.get("risks") or []),
        "topic_clusters": save_topic_clusters(meeting_id, results.get("topic_clusters") or []),
    }
    return counts


def _clamp_confidence(value: Any) -> Optional[float]:
    """Keep confidence within 0.0–1.0 for NUMERIC(4,3) column."""
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return max(0.0, min(1.0, round(v, 3)))
