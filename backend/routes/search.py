from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any

from backend.database import supabase

router = APIRouter(
    prefix="/search",
    tags=["Search"]
)

@router.get("")
async def search_all(q: str = Query(..., min_length=1, description="Search query string")):
    """
    Smart search API.
    Searches across:
      - meetings (title, transcript_text, summary)
      - action_items (task)
      - decisions (decision_text)
      - risks (risk_text)
    
    Returns categorized results cleanly.
    """
    try:
        # We use ilike for case-insensitive matching in Supabase (PostgREST)
        pattern = f"%{q}%"
        
        # 1. Search meetings (title, transcript, summary)
        # Using PostgREST .or_ syntax: 'column.operator.value,column.operator.value'
        meetings_resp = supabase.table("meetings").select("id, title, summary, created_at").or_(
            f"title.ilike.{pattern},summary.ilike.{pattern},transcript_text.ilike.{pattern}"
        ).execute()

        # 2. Search action items
        actions_resp = supabase.table("action_items").select("id, task, status, meeting_id, created_at").ilike("task", pattern).execute()

        # 3. Search decisions
        decisions_resp = supabase.table("decisions").select("id, decision_text, category, meeting_id, created_at").ilike("decision_text", pattern).execute()

        # 4. Search risks
        risks_resp = supabase.table("risks").select("id, risk_text, severity, meeting_id, created_at").ilike("risk_text", pattern).execute()

        return {
            "query": q,
            "results": {
                "meetings": meetings_resp.data if meetings_resp.data else [],
                "action_items": actions_resp.data if actions_resp.data else [],
                "decisions": decisions_resp.data if decisions_resp.data else [],
                "risks": risks_resp.data if risks_resp.data else []
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
