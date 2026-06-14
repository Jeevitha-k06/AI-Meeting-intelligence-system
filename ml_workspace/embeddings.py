"""
Backward-compatible embedding API — delegates to embedding_manager.
"""

from __future__ import annotations

from typing import Optional, Sequence

import numpy as np

from embedding_manager import encode as _encode
from embedding_manager import get_model_name as get_embedding_model_name
from embedding_manager import load_embedding_model


def get_embedding_model():
    return load_embedding_model()


def preload_embedding_model() -> None:
    load_embedding_model()


def encode_sentences(
    sentences: Sequence[str],
    *,
    batch_size: int = 32,
    show_progress: bool = False,
) -> np.ndarray:
    return _encode(sentences, batch_size=batch_size, show_progress=show_progress)
