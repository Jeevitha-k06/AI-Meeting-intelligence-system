"""
Centralized embedding model manager for SyncSpace AI.

Single in-process singleton; thread-safe lazy load; reused by all pipeline stages.
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Optional, Sequence

import numpy as np

# Reduce HuggingFace noise before any HF import
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "BAAI/bge-base-en-v1.5"
FALLBACK_MODEL = "sentence-transformers/all-mpnet-base-v2"

_model = None
_model_name: Optional[str] = None
_load_lock = threading.Lock()
_encode_lock = threading.Lock()


def _quiet_hf_loggers() -> None:
    for name in ("sentence_transformers", "transformers", "huggingface_hub", "urllib3"):
        logging.getLogger(name).setLevel(logging.WARNING)


def is_model_loaded() -> bool:
    return _model is not None


def get_model_name() -> str:
    return _model_name or DEFAULT_MODEL


def load_embedding_model(force: bool = False) -> object:
    """
    Load SentenceTransformer once per process.

    Returns cached model on subsequent calls with a reuse log line.
    """
    global _model, _model_name

    _quiet_hf_loggers()

    if _model is not None and not force:
        logger.info("[SyncSpace AI] Reusing cached embedding model.")
        return _model

    with _load_lock:
        if _model is not None and not force:
            logger.info("[SyncSpace AI] Reusing cached embedding model.")
            return _model

        logger.info("[SyncSpace AI] Loading embedding model...")
        from sentence_transformers import SentenceTransformer

        last_err: Optional[Exception] = None
        for name in (DEFAULT_MODEL, FALLBACK_MODEL):
            try:
                _model = SentenceTransformer(name)
                _model_name = name
                logger.info("[SyncSpace AI] Embedding model loaded successfully: %s", name)
                return _model
            except Exception as exc:
                last_err = exc
                logger.warning("[SyncSpace AI] Could not load %s: %s", name, exc)

        raise RuntimeError(f"Failed to load embedding model. Last error: {last_err}")


def encode(
    sentences: Sequence[str],
    *,
    batch_size: int = 32,
    show_progress: bool = False,
) -> np.ndarray:
    """Encode texts to L2-normalized vectors using the shared model."""
    if not sentences:
        return np.array([], dtype=np.float32)

    model = load_embedding_model()
    with _encode_lock:
        vectors = model.encode(
            list(sentences),
            normalize_embeddings=True,
            batch_size=batch_size,
            show_progress_bar=show_progress,
        )
    return np.asarray(vectors, dtype=np.float32)
