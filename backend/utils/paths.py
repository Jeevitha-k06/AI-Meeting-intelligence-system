"""
Path helpers for uploads and ML workspace (read-only reference to pipeline).
"""

from pathlib import Path

from backend.config import UPLOADS_DIR, ML_WORKSPACE_DIR


def ensure_uploads_dir() -> Path:
    """Create backend/uploads/ if missing; return absolute path."""
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOADS_DIR


def get_ml_workspace_dir() -> Path:
    """Path to existing NLP pipeline — used later by pipeline service."""
    return ML_WORKSPACE_DIR
