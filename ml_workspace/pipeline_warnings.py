"""
Targeted warning filters for cleaner SyncSpace AI console output.

Suppresses known noisy library warnings only; does not hide application errors.
"""

from __future__ import annotations

import warnings


def configure_pipeline_warnings() -> None:
    """Call once at pipeline startup (before sklearn/umap imports if possible)."""
    warnings.filterwarnings(
        "ignore",
        message=".*'force_all_finite'.*",
        category=FutureWarning,
    )
    warnings.filterwarnings(
        "ignore",
        message=".*'ensure_all_finite'.*",
        category=FutureWarning,
    )
    warnings.filterwarnings(
        "ignore",
        message=".*n_jobs value.*overridden.*random_state.*",
        category=UserWarning,
        module="umap",
    )
    warnings.filterwarnings(
        "ignore",
        message=".*n_jobs value.*overridden.*",
        category=UserWarning,
    )
    warnings.filterwarnings(
        "ignore",
        message=".*invalid value encountered in cast.*",
        category=RuntimeWarning,
    )
