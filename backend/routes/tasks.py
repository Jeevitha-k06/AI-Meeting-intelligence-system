"""
Task endpoints — action items from Supabase with status updates.
"""

from __future__ import annotations

import traceback
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.config import get_settings
from backend.schemas import (
    TaskDetailResponse,
    TaskItem,
    TasksListResponse,
    TaskStatusUpdateRequest,
    TaskStatusUpdateResponse,
)
from backend.services import task_service

router = APIRouter(tags=["Tasks"])


class CreateTaskRequest(BaseModel):
    """POST /tasks body — manual task creation by admin/owner."""
    task: str
    meeting_id: str                    # required: link to an existing meeting
    assigned_to: Optional[str] = None  # UUID of assignee or omit
    deadline: Optional[str] = None     # ISO 8601 or omit


@router.post("/tasks", response_model=TaskDetailResponse, status_code=201)
def create_task(body: CreateTaskRequest) -> TaskDetailResponse:
    """
    Manually create an action item (admin/owner only).
    Role enforcement is handled frontend-side.
    """
    settings = get_settings()
    try:
        settings.validate_supabase()
        if not body.task.strip():
            raise HTTPException(status_code=400, detail="Task description cannot be empty.")

        assigned_to = body.assigned_to if body.assigned_to else None
        deadline    = body.deadline    if body.deadline    else None

        row = task_service.create_task(
            meeting_id=body.meeting_id,
            task=body.task,
            assigned_to=assigned_to,
            deadline=deadline,
        )
        print(f"[tasks] Created manual task: {row['id']!r} assigned_to={assigned_to!r}")
        return TaskDetailResponse(success=True, task=TaskItem(**row))

    except HTTPException:
        raise
    except Exception as exc:
        detail = str(exc)
        if settings.debug:
            detail = f"{detail}\n{traceback.format_exc()}"
        raise HTTPException(status_code=500, detail=f"Failed to create task: {detail}") from exc


@router.get("/tasks", response_model=TasksListResponse)
def list_tasks() -> TasksListResponse:
    """Fetch all action items (tasks), newest first."""
    settings = get_settings()

    try:
        settings.validate_supabase()
        rows = task_service.fetch_all_tasks()
        tasks = [TaskItem(**row) for row in rows]
        print(f"[tasks] Fetched {len(tasks)} task(s)")
        return TasksListResponse(success=True, count=len(tasks), tasks=tasks)

    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        detail = str(exc)
        if settings.debug:
            detail = f"{detail}\n{traceback.format_exc()}"
        print(f"[tasks] Error listing tasks: {detail}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch tasks: {detail}") from exc


@router.get("/tasks/{task_id}", response_model=TaskDetailResponse)
def get_task(task_id: str) -> TaskDetailResponse:
    """Fetch one action item by id."""
    settings = get_settings()

    try:
        settings.validate_supabase()
        row = task_service.fetch_task_by_id(task_id)

        if row is None:
            raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")

        print(f"[tasks] Fetched task {task_id}")
        return TaskDetailResponse(success=True, task=TaskItem(**row))

    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        detail = str(exc)
        if settings.debug:
            detail = f"{detail}\n{traceback.format_exc()}"
        print(f"[tasks] Error fetching task {task_id}: {detail}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch task: {detail}") from exc


class TaskAssignmentRequest(BaseModel):
    """PATCH /tasks/{task_id}/assignment body."""
    assigned_to: Optional[str] = None   # UUID or empty string to clear
    deadline: Optional[str] = None      # ISO 8601 or empty string to clear


@router.patch("/tasks/{task_id}/assignment", response_model=TaskStatusUpdateResponse)
def update_task_assignment(task_id: str, body: TaskAssignmentRequest):
    """
    Update action_items.assigned_to (UUID) and/or deadline (TIMESTAMPTZ).
    Role enforcement is handled frontend-side; backend accepts any authenticated caller.
    """
    settings = get_settings()
    try:
        settings.validate_supabase()
        # Normalise empty strings → None (clears the field)
        assigned_to = body.assigned_to if body.assigned_to else None
        deadline = body.deadline if body.deadline else None

        updated = task_service.update_task_assignment(task_id, assigned_to, deadline)
        if updated is None:
            raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")

        print(f"[tasks] Updated assignment for {task_id}: assigned_to={assigned_to!r} deadline={deadline!r}")
        return TaskStatusUpdateResponse(
            success=True,
            message="Task assignment updated",
            task=TaskItem(**updated),
        )
    except HTTPException:
        raise
    except Exception as exc:
        detail = str(exc)
        if settings.debug:
            detail = f"{detail}\n{traceback.format_exc()}"
        raise HTTPException(status_code=500, detail=f"Failed to update assignment: {detail}") from exc


@router.delete("/tasks/{task_id}", status_code=200)
def delete_task(task_id: str):
    """Delete a single action item by id."""
    settings = get_settings()
    try:
        settings.validate_supabase()
        deleted = task_service.delete_task(task_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")
        print(f"[tasks] Deleted task {task_id}")
        return {"success": True, "message": "Task deleted"}
    except HTTPException:
        raise
    except Exception as exc:
        detail = str(exc)
        if settings.debug:
            detail = f"{detail}\n{traceback.format_exc()}"
        raise HTTPException(status_code=500, detail=f"Failed to delete task: {detail}") from exc


@router.patch("/tasks/{task_id}/status", response_model=TaskStatusUpdateResponse)
def update_task_status(
    task_id: str,
    body: TaskStatusUpdateRequest,
) -> TaskStatusUpdateResponse:
    """Update action_items.status (open | in_progress | completed | cancelled)."""
    settings = get_settings()

    try:
        settings.validate_supabase()
        updated = task_service.update_task_status(task_id, body.status)

        if updated is None:
            raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")

        print(f"[tasks] Updated task {task_id} → status={body.status}")
        return TaskStatusUpdateResponse(
            success=True,
            message=f"Task status updated to '{body.status}'",
            task=TaskItem(**updated),
        )

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        detail = str(exc)
        if settings.debug:
            detail = f"{detail}\n{traceback.format_exc()}"
        print(f"[tasks] Error updating task {task_id}: {detail}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update task status: {detail}",
        ) from exc
