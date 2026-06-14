"""
Business logic layer (between routes and database / ML pipeline).

Planned modules (Phase 2+):
  - meeting_service.py   → create meetings, update processing_status
  - pipeline_service.py  → run ml_workspace/run_pipeline.py on uploaded files
  - results_service.py   → persist summaries, actions, decisions, clusters to Supabase

Routes should stay thin: validate input → call service → return JSON.
The ML code stays in ml_workspace/ and is only invoked from pipeline_service.
"""
