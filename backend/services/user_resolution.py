"""
Resolve extracted assignee names to Supabase auth.users UUIDs.

The NLP pipeline produces human-readable names (e.g. "Rahul", "Sarah").
This module loads the team's members, matches extracted names using
case-insensitive fuzzy matching, and returns the best UUID match.

Matching strategy (in order):
  1. Exact full-name match          "Rahul Sharma" → "Rahul Sharma"
  2. First-name-only match          "Rahul"        → "Rahul Sharma"
  3. Last-name-only match           "Sharma"       → "Rahul Sharma"
  4. Partial substring match        "rah"          → "Rahul Sharma"
  5. No match → returns None        (assigned_to stays NULL)
"""

from __future__ import annotations

import logging
import re
from difflib import SequenceMatcher
from functools import lru_cache
from typing import Dict, List, Optional, Tuple

from backend.database import get_supabase

logger = logging.getLogger(__name__)

# Minimum similarity ratio for fuzzy fallback (0–1)
FUZZY_THRESHOLD = 0.72


# ─── Team member loader ───────────────────────────────────────────────────────

def fetch_team_members(team_id: str) -> List[Dict[str, str]]:
    """
    Return list of {user_id, display_name, email} for all members of team_id.

    Joins team_members → auth.users via the Supabase admin client.
    Falls back to empty list on any error (resolution is best-effort).
    """
    try:
        # Fetch user_ids for this team
        tm_resp = (
            get_supabase()
            .table("team_members")
            .select("user_id, role")
            .eq("team_id", team_id)
            .execute()
        )
        rows = tm_resp.data or []
        if not rows:
            logger.info("[user_resolution] No team members found for team %s", team_id)
            return []

        user_ids = [r["user_id"] for r in rows]

        # Fetch user metadata for those IDs via auth.users
        # Supabase JS exposes admin.listUsers(); supabase-py v2 uses auth.admin.list_users()
        members: List[Dict[str, str]] = []
        for uid in user_ids:
            try:
                resp = get_supabase().auth.admin.get_user_by_id(uid)
                user = resp.user
                if not user:
                    continue
                full_name = (
                    (user.user_metadata or {}).get("full_name")
                    or (user.user_metadata or {}).get("name")
                    or ""
                ).strip()
                email = (user.email or "").strip()
                display = full_name or email.split("@")[0]
                members.append({"user_id": uid, "display_name": display, "email": email})
            except Exception as exc:
                logger.debug("[user_resolution] Could not fetch user %s: %s", uid, exc)

        logger.info(
            "[user_resolution] Loaded %d team member(s) for team %s: %s",
            len(members),
            team_id,
            [m["display_name"] for m in members],
        )
        return members

    except Exception as exc:
        logger.warning("[user_resolution] fetch_team_members failed: %s", exc)
        return []


# ─── Name matching ────────────────────────────────────────────────────────────

def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def resolve_assignee_to_uuid(
    extracted_name: str,
    team_members: List[Dict[str, str]],
) -> Optional[str]:
    """
    Match an extracted name string against a list of team members.

    Returns the matching user_id UUID or None.
    """
    if not extracted_name or not team_members:
        return None

    needle = _normalize(extracted_name)
    if not needle:
        return None

    best_uid: Optional[str] = None
    best_score: float = 0.0

    for member in team_members:
        display = _normalize(member.get("display_name", ""))
        email_local = _normalize(member.get("email", "").split("@")[0])

        # 1. Exact full match
        if needle == display or needle == email_local:
            logger.debug(
                "[user_resolution] Exact match: '%s' → %s (%s)",
                extracted_name, member["user_id"], member["display_name"],
            )
            return member["user_id"]

        # 2. First-name match
        first = display.split()[0] if display else ""
        if first and needle == first:
            if best_score < 0.95:
                best_score = 0.95
                best_uid = member["user_id"]
            continue

        # 3. Last-name match
        parts = display.split()
        last = parts[-1] if len(parts) > 1 else ""
        if last and needle == last:
            if best_score < 0.90:
                best_score = 0.90
                best_uid = member["user_id"]
            continue

        # 4. Substring containment (extracted name appears inside display name)
        if needle in display or display in needle:
            if best_score < 0.85:
                best_score = 0.85
                best_uid = member["user_id"]
            continue

        # 5. Fuzzy ratio fallback
        ratio = SequenceMatcher(None, needle, display).ratio()
        if ratio >= FUZZY_THRESHOLD and ratio > best_score:
            best_score = ratio
            best_uid = member["user_id"]

    if best_uid:
        match = next((m for m in team_members if m["user_id"] == best_uid), None)
        logger.info(
            "[user_resolution] Fuzzy match (%.2f): '%s' → %s (%s)",
            best_score,
            extracted_name,
            best_uid,
            match["display_name"] if match else "?",
        )
    else:
        logger.info(
            "[user_resolution] No match found for '%s' among %d members",
            extracted_name,
            len(team_members),
        )

    return best_uid
