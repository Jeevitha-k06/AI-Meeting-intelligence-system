"""
Task (action item) operations — reads and updates public.action_items.
"""

from __future__ import annotations

from typing import List, Optional

from backend.database import get_supabase

# Valid values from supabase_schema.sql action_status enum
ALLOWED_STATUSES = frozenset({"open", "in_progress", "completed", "cancelled"})

TASK_COLUMNS = "id, meeting_id, task, status, confidence, deadline, assigned_to, created_at"


def create_task(
    meeting_id: str,
    task: str,
    assigned_to: Optional[str] = None,
    deadline: Optional[str] = None,
) -> dict:
    """
    Manually create a new action_item row with status = open.
    meeting_id must exist — we use a sentinel/placeholder meeting for manual tasks
    or any valid meeting UUID passed from the frontend.
    Returns the created row.
    """
    payload: dict = {
        "task": task.strip(),
        "status": "open",
        "meeting_id": meeting_id,
    }
    if assigned_to:
        payload["assigned_to"] = assigned_to
    if deadline:
        payload["deadline"] = deadline

    response = (
        get_supabase()
        .table("action_items")
        .insert(payload)
        .select(TASK_COLUMNS)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise RuntimeError("Failed to create task.")
    return rows[0]


def fetch_all_tasks() -> List[dict]:
    """All action items, newest first."""
    response = (
        get_supabase()
        .table("action_items")
        .select(TASK_COLUMNS)
        .order("created_at", desc=True)
        .execute()
    )
    return list(response.data or [])


def fetch_task_by_id(task_id: str) -> Optional[dict]:
    """Single action item or None."""
    response = (
        get_supabase()
        .table("action_items")
        .select(TASK_COLUMNS)
        .eq("id", task_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def delete_task(task_id: str) -> bool:
    """
    Delete a single action item by id.
    Returns True if a row was deleted, False if not found.
    """
    response = (
        get_supabase()
        .table("action_items")
        .delete()
        .eq("id", task_id)
        .execute()
    )
    return bool(response.data)


def update_task_assignment(task_id: str, assigned_to: Optional[str], deadline: Optional[str]) -> Optional[dict]:
    """
    Update action_items.assigned_to and/or deadline.
    assigned_to must be a UUID string or None to clear.
    deadline must be an ISO 8601 string or None to clear.
    Returns updated row or None if task not found.
    """
    payload: dict = {}
    if assigned_to is not None:
        payload["assigned_to"] = assigned_to if assigned_to else None
    if deadline is not None:
        payload["deadline"] = deadline if deadline else None

    if not payload:
        return fetch_task_by_id(task_id)

    response = (
        get_supabase()
        .table("action_items")
        .update(payload)
        .eq("id", task_id)
        .select(TASK_COLUMNS)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def update_task_status(task_id: str, status: str) -> Optional[dict]:
    """
    Update action_items.status. Returns updated row or None if task not found.
    Raises ValueError for invalid status.
    """
    normalized = status.strip().lower()
    if normalized not in ALLOWED_STATUSES:
        raise ValueError(
            f"Invalid status '{status}'. Allowed: {', '.join(sorted(ALLOWED_STATUSES))}"
        )

    response = (
        get_supabase()
        .table("action_items")
        .update({"status": normalized})
        .eq("id", task_id)
        .select(TASK_COLUMNS)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None
