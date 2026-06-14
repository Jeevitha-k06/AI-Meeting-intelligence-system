"""
Pydantic response models for API endpoints.

Keeps route handlers thin and documents the JSON shape for Swagger UI.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

TaskStatus = Literal["open", "in_progress", "completed", "cancelled"]


class MeetingListItem(BaseModel):
    """Single meeting row for dashboard list views."""

    id: str
    title: str
    summary: Optional[str] = None
    processing_status: str
    uploaded_file_name: Optional[str] = None
    created_at: datetime


class MeetingsListResponse(BaseModel):
    """GET /meetings response wrapper."""

    success: bool = True
    count: int = Field(..., description="Number of meetings returned")
    meetings: List[MeetingListItem]


class MeetingDetail(BaseModel):
    """Core meeting record for detail view."""

    id: str
    team_id: str
    title: str
    summary: Optional[str] = None
    processing_status: str
    uploaded_file_name: Optional[str] = None
    transcript_text: Optional[str] = None
    created_at: datetime


class ActionItemRecord(BaseModel):
    id: str
    meeting_id: str
    task: str
    status: str
    assigned_to: Optional[str] = None   # UUID of assigned user (nullable)
    confidence: Optional[float] = None
    deadline: Optional[datetime] = None
    created_at: datetime


class DecisionRecord(BaseModel):
    id: str
    meeting_id: str
    decision_text: str
    category: Optional[str] = None
    confidence: Optional[float] = None
    created_at: datetime


class RiskRecord(BaseModel):
    id: str
    meeting_id: str
    risk_text: str
    severity: str
    created_at: datetime


class TopicClusterRecord(BaseModel):
    id: str
    meeting_id: str
    topic_name: str
    coherence: Optional[float] = None
    keywords: List[str] = Field(default_factory=list)
    created_at: datetime

    @field_validator("keywords", mode="before")
    @classmethod
    def coerce_keywords(cls, value: object) -> List[str]:
        return list(value) if value else []


class MeetingDetailResponse(BaseModel):
    """GET /meetings/{meeting_id} — full meeting intelligence bundle."""

    success: bool = True
    meeting: MeetingDetail
    action_items: List[ActionItemRecord] = Field(default_factory=list)
    decisions: List[DecisionRecord] = Field(default_factory=list)
    risks: List[RiskRecord] = Field(default_factory=list)
    topic_clusters: List[TopicClusterRecord] = Field(default_factory=list)


class TaskItem(BaseModel):
    """Action item exposed as a task in the tasks API."""

    id: str
    meeting_id: str
    task: str
    status: TaskStatus
    assigned_to: Optional[str] = None   # UUID of assigned user (nullable)
    confidence: Optional[float] = None
    deadline: Optional[datetime] = None
    created_at: datetime


class TasksListResponse(BaseModel):
    """GET /tasks response."""

    success: bool = True
    count: int
    tasks: List[TaskItem]


class TaskDetailResponse(BaseModel):
    """GET /tasks/{task_id} response."""

    success: bool = True
    task: TaskItem


class TaskStatusUpdateRequest(BaseModel):
    """PATCH /tasks/{task_id}/status body."""

    status: TaskStatus


class TaskStatusUpdateResponse(BaseModel):
    """PATCH /tasks/{task_id}/status response."""

    success: bool = True
    message: str
    task: TaskItem


class DashboardStats(BaseModel):
    """Aggregate KPIs for GET /dashboard/stats."""

    total_meetings: int
    total_tasks: int
    completed_tasks: int
    pending_tasks: int
    total_decisions: int
    total_risks: int


class DashboardStatsResponse(BaseModel):
    """GET /dashboard/stats — overview for home dashboard."""

    success: bool = True
    stats: DashboardStats
    recent_meetings: List[MeetingListItem] = Field(
        ...,
        description="Five most recent meetings (newest first)",
    )
