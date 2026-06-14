"""
Convert NLP-extracted deadline strings to TIMESTAMPTZ-compatible ISO strings.

Handles patterns like:
  "June 15"        → "2026-06-15T00:00:00+00:00"
  "January 3rd"    → "2026-01-03T00:00:00+00:00"
  "Not specified"  → None
  "—"              → None
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional

# Months the extractor produces
MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}

_DATE_RE = re.compile(
    r"\b(?P<month>january|february|march|april|may|june|july|august|"
    r"september|october|november|december)\s+"
    r"(?P<day>\d{1,2})(?:st|nd|rd|th)?\b",
    re.IGNORECASE,
)

_NULL_VALUES = frozenset({
    "", "not specified", "n/a", "none", "—", "-", "tbd", "tbc", "unknown",
})


def parse_deadline(raw: str) -> Optional[str]:
    """
    Parse a deadline string extracted by the NLP pipeline.

    Returns an ISO 8601 UTC string (suitable for TIMESTAMPTZ) or None.
    """
    if not raw:
        return None

    cleaned = raw.strip().lower()
    if cleaned in _NULL_VALUES:
        return None

    # Handle "June 15; July 22" — take the first date only
    # (multi-deadline items are already split into separate ActionItem rows)
    first_segment = cleaned.split(";")[0].strip()

    m = _DATE_RE.search(first_segment)
    if not m:
        return None

    month_num = MONTH_MAP[m.group("month").lower()]
    day = int(m.group("day"))
    # Use current year; if the date has already passed this year, push to next year
    now = datetime.now(timezone.utc)
    year = now.year
    try:
        dt = datetime(year, month_num, day, tzinfo=timezone.utc)
        if dt < now:
            dt = datetime(year + 1, month_num, day, tzinfo=timezone.utc)
    except ValueError:
        # Invalid day for month (e.g. Feb 30)
        return None

    return dt.isoformat()
