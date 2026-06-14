"""
Lightweight pipeline evaluation and timing metrics.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class StageTimer:
    """Record per-stage durations."""

    stages: Dict[str, float] = field(default_factory=dict)

    def record(self, name: str, seconds: float) -> None:
        self.stages[name] = round(seconds, 3)

    def total(self) -> float:
        return round(sum(self.stages.values()), 3)

    def to_dict(self) -> Dict[str, float]:
        return dict(self.stages)


class PipelineEvaluator:
    """Collect timing and quality metrics during a pipeline run."""

    def __init__(self) -> None:
        self.timer = StageTimer()
        self._t0: Optional[float] = None

    def start(self) -> None:
        self._t0 = time.perf_counter()

    def stop_stage(self, name: str, started_at: float) -> None:
        self.timer.record(name, time.perf_counter() - started_at)

    def clustering_metrics(
        self,
        clusters: List[dict],
        silhouette: Optional[float] = None,
        noise_count: int = 0,
    ) -> Dict[str, Any]:
        return {
            "cluster_count": len(clusters),
            "total_clustered_sentences": sum(len(c.get("sentences", [])) for c in clusters),
            "silhouette_score": silhouette,
            "noise_points": noise_count,
            "avg_coherence": _avg_coherence(clusters),
        }

    def extraction_metrics(
        self,
        tasks: List[dict],
        decisions: List[dict],
    ) -> Dict[str, Any]:
        return {
            "action_item_count": len(tasks),
            "total_tasks": sum(len(t.get("tasks", [])) for t in tasks),
            "decision_count": len(decisions),
            "avg_decision_confidence": _avg_confidence(decisions),
        }

    def summary_metrics(self, summary: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "executive_summary_words": len(
                (summary.get("executive_summary") or "").split()
            ),
            "key_decisions": len(summary.get("key_decisions", [])),
            "action_items": len(summary.get("action_items", [])),
            "deadlines": len(summary.get("critical_deadlines", [])),
            "risks": len(summary.get("major_risks", [])),
        }

    def build_report(
        self,
        *,
        clusters: List[dict],
        tasks: List[dict],
        decisions: List[dict],
        summary: Dict[str, Any],
        silhouette: Optional[float] = None,
    ) -> Dict[str, Any]:
        return {
            "timing_seconds": {**self.timer.to_dict(), "total": self.timer.total()},
            "clustering": self.clustering_metrics(clusters, silhouette=silhouette),
            "extraction": self.extraction_metrics(tasks, decisions),
            "summary": self.summary_metrics(summary),
            "notes": {
                "decision_precision": (
                    "Manual review recommended: verify commitment language per decision."
                ),
                "action_quality": (
                    "Check for near-duplicate tasks with similar verbs (write/outline)."
                ),
                "summarization": (
                    "Compare executive summary against key_decisions and action_items."
                ),
            },
        }


def _avg_coherence(clusters: List[dict]) -> Optional[float]:
    vals = [c.get("coherence") for c in clusters if c.get("coherence") is not None]
    if not vals:
        return None
    return round(sum(vals) / len(vals), 3)


def _avg_confidence(decisions: List[dict]) -> Optional[float]:
    vals = [d.get("confidence") for d in decisions if d.get("confidence") is not None]
    if not vals:
        return None
    return round(sum(vals) / len(vals), 3)
