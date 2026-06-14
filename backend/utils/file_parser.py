"""
Transcript text extraction from uploaded meeting files.

Supported formats: .txt, .pdf (PyPDF2), .docx (python-docx)
File type is detected from the extension (and validated against allowed types).
"""

from __future__ import annotations

import re
from enum import Enum
from pathlib import Path

SUPPORTED_EXTENSIONS = {".txt", ".pdf", ".docx"}


class FileType(str, Enum):
    TXT = "txt"
    PDF = "pdf"
    DOCX = "docx"


def detect_file_type(file_path: str | Path) -> FileType:
    """
    Detect transcript file type from extension.

    Raises ValueError for unsupported or missing extensions.
    """
    ext = Path(file_path).suffix.lower()
    if ext == ".txt":
        return FileType.TXT
    if ext == ".pdf":
        return FileType.PDF
    if ext == ".docx":
        return FileType.DOCX
    raise ValueError(
        f"Unsupported file type '{ext or '(none)'}'. "
        f"Allowed: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
    )


def clean_transcript_text(text: str) -> str:
    """
    Normalize extracted text for the NLP pipeline.

    - Strip leading/trailing whitespace
    - Normalize line endings
    - Collapse excessive blank lines
    - Remove null bytes and other control chars (except newlines/tabs)
    """
    if not text:
        return ""
    cleaned = text.replace("\x00", "")
    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = re.sub(r"[^\S\n]+", " ", cleaned)  # collapse spaces per line
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def extract_text_from_file(file_path: str | Path) -> str:
    """
    Extract and clean transcript text from a saved upload.

    Automatically selects parser based on file extension.

    Raises:
        ValueError — missing file, unsupported type, empty extraction, or parse error
    """
    path = Path(file_path)
    if not path.is_file():
        raise ValueError(f"File not found: {path}")

    file_type = detect_file_type(path)

    try:
        if file_type == FileType.TXT:
            raw = _extract_txt(path)
        elif file_type == FileType.PDF:
            raw = _extract_pdf(path)
        else:
            raw = _extract_docx(path)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Failed to read {file_type.value.upper()} file: {exc}") from exc

    text = clean_transcript_text(raw)
    if not text:
        raise ValueError(
            f"No transcript text could be extracted from this {file_type.value.upper()} file."
        )
    return text


def _extract_txt(path: Path) -> str:
    """Plain text — UTF-8 with replacement for invalid bytes."""
    return path.read_text(encoding="utf-8", errors="replace")


def _extract_pdf(path: Path) -> str:
    """PDF text extraction via PyPDF2."""
    try:
        from PyPDF2 import PdfReader
    except ImportError as exc:
        raise ValueError(
            "PDF support requires PyPDF2. Install: pip install PyPDF2"
        ) from exc

    reader = PdfReader(str(path))
    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception as exc:
            raise ValueError("PDF is password-protected and cannot be read.") from exc

    pages: list[str] = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            pages.append(page_text)

    if not pages:
        raise ValueError("PDF contains no extractable text (it may be scanned images only).")
    return "\n\n".join(pages)


def _extract_docx(path: Path) -> str:
    """Word document — paragraph text via python-docx."""
    try:
        from docx import Document
    except ImportError as exc:
        raise ValueError(
            "DOCX support requires python-docx. Install: pip install python-docx"
        ) from exc

    document = Document(str(path))
    paragraphs = [p.text.strip() for p in document.paragraphs if p.text.strip()]
    if not paragraphs:
        raise ValueError("DOCX file contains no readable paragraph text.")
    return "\n".join(paragraphs)
