"""
File upload helpers — save files and extract transcript text.

Parsing logic lives in backend.utils.file_parser (txt / pdf / docx).
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Tuple

from fastapi import UploadFile

from backend.config import UPLOADS_DIR
from backend.utils.file_parser import SUPPORTED_EXTENSIONS, extract_text_from_file

# Re-export for routes and validation
ALLOWED_EXTENSIONS = SUPPORTED_EXTENSIONS
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB — reasonable for student demos


def _safe_filename(original: str) -> str:
    """Strip path components and unsafe chars; keep a readable base name."""
    name = Path(original or "upload").name
    name = re.sub(r"[^\w.\-]", "_", name)
    if not name or name in (".", ".."):
        name = "upload"
    return name


def validate_upload_file(filename: str, size: int) -> str:
    """
    Validate extension and size. Returns normalized extension (e.g. '.txt').
    Raises ValueError with a user-friendly message.
    """
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type '{ext or '(none)'}'. "
            f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )
    if size <= 0:
        raise ValueError("Uploaded file is empty.")
    if size > MAX_UPLOAD_BYTES:
        raise ValueError(
            f"File too large. Maximum size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
        )
    return ext


async def save_uploaded_file(upload: UploadFile) -> Tuple[Path, str]:
    """
    Save multipart upload to backend/uploads/ with a unique prefix.

    Returns:
        (absolute_path, stored_filename)
    """
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    original = upload.filename or "transcript.txt"
    ext = Path(original).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type '{ext or '(none)'}'. "
            f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    content = await upload.read()
    size = len(content)
    validate_upload_file(original, size)

    safe_base = _safe_filename(original)
    stored_name = f"{uuid.uuid4().hex}_{safe_base}"
    dest = UPLOADS_DIR / stored_name

    dest.write_bytes(content)
    return dest.resolve(), stored_name
