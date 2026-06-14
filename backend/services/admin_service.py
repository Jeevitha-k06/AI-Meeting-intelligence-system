"""
Admin dashboard aggregation service.

Pulls team performance, deadlines, risk summary, recent decisions,
and member activity from existing tables — no new schema required.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.database import get_supabase
from backend.services.user_resolution import fetch_team_members


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _in_7_days_iso() -> str:
    from datetime import timedelta
    return (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()


# ─── Tasks for a team ────────────────────────────────────────────────────────

def _fetch_all_tasks_for_team(team_id: str) -> List[dict]:
    """
    Fetch all action_items for meetings that belong to team_id.
    Joins via meetings.team_id.
    """
    # Get meeting IDs for this team
    meetings_resp = (
        get_supabase()
        .table("meetings")
        .select("id")
        .eq("team_id", team_id)
        .execute()
    )
    meeting_ids = [r["id"] for r in (meetings_resp.data or [])]
    if not meeting_ids:
        return []

    tasks_resp = (
        get_supabase()
        .table("action_items")
        .select("id, task, status, assigned_to, deadline, created_at, meeting_id")
        .in_("meeting_id", meeting_ids)
        .execute()
    )
    return list(tasks_resp.data or [])


# ─── Risks for a team ────────────────────────────────────────────────────────

def _fetch_risks_for_team(team_id: str, limit: int = 20) -> List[dict]:
    meetings_resp = (
        get_supabase()
        .table("meetings")
        .select("id, title")
        .eq("team_id", team_id)
        .execute()
    )
    meeting_map = {r["id"]: r["title"] for r in (meetings_resp.data or [])}
    if not meeting_map:
        return []

    risks_resp = (
        get_supabase()
        .table("risks")
        .select("id, meeting_id, risk_text, severity, created_at")
        .in_("meeting_id", list(meeting_map.keys()))
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    risks = []
    for r in (risks_resp.data or []):
        risks.append({
            **r,
            "meeting_title": meeting_map.get(r["meeting_id"], "Unknown Meeting"),
        })
    return risks


# ─── Decisions for a team ────────────────────────────────────────────────────

def _fetch_decisions_for_team(team_id: str, limit: int = 10) -> List[dict]:
    meetings_resp = (
        get_supabase()
        .table("meetings")
        .select("id, title")
        .eq("team_id", team_id)
        .execute()
    )
    meeting_map = {r["id"]: r["title"] for r in (meetings_resp.data or [])}
    if not meeting_map:
        return []

    dec_resp = (
        get_supabase()
        .table("decisions")
        .select("id, meeting_id, decision_text, category, confidence, created_at")
        .in_("meeting_id", list(meeting_map.keys()))
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    decisions = []
    for d in (dec_resp.data or []):
        decisions.append({
            **d,
            "meeting_title": meeting_map.get(d["meeting_id"], "Unknown Meeting"),
        })
    return decisions


# ─── Main aggregator ─────────────────────────────────────────────────────────

def fetch_admin_report(team_id: str) -> Dict[str, Any]:
    """
    Single call that returns everything the Admin Dashboard needs.

    Structure:
      overview        — KPI numbers
      member_perf     — per-member task breakdown
      deadlines       — overdue / today / next-7-days tasks
      risk_summary    — counts by severity + recent risk rows
      decisions       — recent decisions with meeting title
      members         — list with role (for active-members widget)
    """
    now = datetime.now(timezone.utc)

    # ── Members ──────────────────────────────────────────────────────────────
    members = fetch_team_members(team_id)          # [{user_id, display_name, email}]
    # Fetch roles too
    tm_resp = (
        get_supabase()
        .table("team_members")
        .select("user_id, role, joined_at")
        .eq("team_id", team_id)
        .execute()
    )
    role_map: Dict[str, str] = {}
    joined_map: Dict[str, str] = {}
    for row in (tm_resp.data or []):
        role_map[row["user_id"]] = row["role"]
        joined_map[row["user_id"]] = row.get("joined_at", "")

    members_with_roles = [
        {
            **m,
            "role": role_map.get(m["user_id"], "member"),
            "joined_at": joined_map.get(m["user_id"], ""),
        }
        for m in members
    ]

    # ── Tasks ────────────────────────────────────────────────────────────────
    all_tasks = _fetch_all_tasks_for_team(team_id)
    total_tasks = len(all_tasks)
    completed_tasks = sum(1 for t in all_tasks if t["status"] == "completed")
    open_tasks = sum(1 for t in all_tasks if t["status"] in ("open", "in_progress"))
    cancelled_tasks = sum(1 for t in all_tasks if t["status"] == "cancelled")

    # Overdue = deadline < now AND status != completed/cancelled
    def _is_overdue(t: dict) -> bool:
        if t["status"] in ("completed", "cancelled"):
            return False
        dl = t.get("deadline")
        if not dl:
            return False
        try:
            dl_dt = datetime.fromisoformat(dl.replace("Z", "+00:00"))
            return dl_dt < now
        except Exception:
            return False

    overdue_tasks = sum(1 for t in all_tasks if _is_overdue(t))
    completion_rate = round((completed_tasks / total_tasks * 100), 1) if total_tasks else 0.0

    # ── Member performance ───────────────────────────────────────────────────
    perf: Dict[str, Dict[str, Any]] = {}
    for m in members_with_roles:
        uid = m["user_id"]
        assigned = [t for t in all_tasks if t.get("assigned_to") == uid]
        comp = sum(1 for t in assigned if t["status"] == "completed")
        op = sum(1 for t in assigned if t["status"] in ("open", "in_progress"))
        ov = sum(1 for t in assigned if _is_overdue(t))
        rate = round((comp / len(assigned) * 100), 1) if assigned else 0.0
        perf[uid] = {
            "user_id": uid,
            "display_name": m["display_name"],
            "role": m["role"],
            "assigned": len(assigned),
            "completed": comp,
            "open": op,
            "overdue": ov,
            "completion_rate": rate,
        }

    member_perf = sorted(perf.values(), key=lambda x: x["completion_rate"])

    # ── Deadlines section ────────────────────────────────────────────────────
    def _classify_deadline(t: dict) -> Optional[str]:
        dl = t.get("deadline")
        if not dl:
            return None
        if t["status"] in ("completed", "cancelled"):
            return None
        try:
            dl_dt = datetime.fromisoformat(dl.replace("Z", "+00:00"))
        except Exception:
            return None
        delta = (dl_dt - now).total_seconds()
        if delta < 0:
            return "overdue"
        if delta <= 86400:
            return "today"
        if delta <= 7 * 86400:
            return "week"
        return None

    # Build assignee name lookup
    uid_to_name = {m["user_id"]: m["display_name"] for m in members_with_roles}

    deadline_tasks: List[dict] = []
    for t in all_tasks:
        bucket = _classify_deadline(t)
        if bucket:
            deadline_tasks.append({
                "id": t["id"],
                "task": t["task"],
                "status": t["status"],
                "deadline": t.get("deadline"),
                "assigned_to": t.get("assigned_to"),
                "assigned_name": uid_to_name.get(t.get("assigned_to", ""), "Unassigned"),
                "meeting_id": t.get("meeting_id"),
                "bucket": bucket,
            })
    deadline_tasks.sort(key=lambda x: x.get("deadline") or "")

    # ── Risk summary ─────────────────────────────────────────────────────────
    recent_risks = _fetch_risks_for_team(team_id, limit=15)
    risk_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for r in recent_risks:
        sev = r.get("severity", "medium").lower()
        if sev in risk_counts:
            risk_counts[sev] += 1

    # ── Recent decisions ─────────────────────────────────────────────────────
    recent_decisions = _fetch_decisions_for_team(team_id, limit=10)

    # ── Total meetings ───────────────────────────────────────────────────────
    mtg_resp = (
        get_supabase()
        .table("meetings")
        .select("id", count="exact", head=True)
        .eq("team_id", team_id)
        .execute()
    )
    total_meetings = int(mtg_resp.count or 0)

    return {
        "overview": {
            "total_members": len(members_with_roles),
            "total_meetings": total_meetings,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "open_tasks": open_tasks,
            "overdue_tasks": overdue_tasks,
            "cancelled_tasks": cancelled_tasks,
            "completion_rate": completion_rate,
        },
        "member_perf": member_perf,
        "deadline_tasks": deadline_tasks,
        "risk_summary": {
            "counts": risk_counts,
            "recent": recent_risks,
        },
        "decisions": recent_decisions,
        "members": members_with_roles,
    }
