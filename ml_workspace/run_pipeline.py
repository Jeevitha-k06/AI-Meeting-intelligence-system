
# SyncSpace AI — Master NLP Pipeline Runner

from setup_nltk import setup_nltk
import os
import sys
import time
import traceback
from typing import Any, Callable, Dict, Optional

from pipeline_warnings import configure_pipeline_warnings

configure_pipeline_warnings()

from embedding_manager import load_embedding_model
from preprocessor import preprocess_transcript
from summarizer import generate_summary
from action_extractor import extract_tasks
from decision_detector import detect_decisions
from topic_cluster import cluster_topics
from export_results import build_export_payload, export_all
from evaluation import PipelineEvaluator

LINE_WIDTH = 64
THICK_CHAR = "="
THIN_CHAR = "-"
MIN_TRANSCRIPT_CHARS = 50
MIN_TRANSCRIPT_WORDS = 20


def load_transcript(filepath: str) -> str:
    if not os.path.isfile(filepath):
        print(f"\n[ERROR] File not found: {filepath}")
        print("        Supply a valid path to a .txt transcript.\n")
        sys.exit(1)
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as fh:
            content = fh.read()
    except OSError as error:
        print(f"\n[ERROR] Could not read file: {filepath}")
        print(f"        Reason: {error}\n")
        sys.exit(1)
    if not content.strip():
        print(f"\n[ERROR] The transcript file is empty: {filepath}\n")
        sys.exit(1)
    return content.strip()


def validate_transcript(transcript: str, stage: str) -> bool:
    words = len(transcript.split())
    chars = len(transcript)
    if chars < MIN_TRANSCRIPT_CHARS or words < MIN_TRANSCRIPT_WORDS:
        print(
            f"  [WARNING] Transcript may be too short for {stage} "
            f"({words} words, {chars} chars). Results may be sparse."
        )
        return False
    return True


def _print_thick_line() -> None:
    print(THICK_CHAR * LINE_WIDTH)


def _print_thin_line() -> None:
    print(THIN_CHAR * LINE_WIDTH)


def print_banner(filepath: str) -> None:
    _print_thick_line()
    print("   SyncSpace AI — Meeting Intelligence Pipeline")
    _print_thick_line()
    print(f"  Transcript : {os.path.basename(filepath)}")
    print(f"  Full path  : {filepath}")
    _print_thick_line()


def print_section_header(title: str) -> None:
    print()
    _print_thin_line()
    print(f"  {title}")
    _print_thin_line()


def print_stage_timing(stage_name: str, elapsed: float) -> None:
    print(f"  [Stage Completed in {elapsed:.2f}s]  {stage_name}")


def print_footer() -> None:
    print()
    _print_thick_line()
    print("   Pipeline complete.")
    _print_thick_line()
    print()


def _run_stage(
    evaluator: PipelineEvaluator,
    name: str,
    func: Callable[[], Any],
    *,
    required: bool = True,
) -> Any:
    t0 = time.perf_counter()
    try:
        result = func()
        evaluator.stop_stage(name, t0)
        print_stage_timing(name, time.perf_counter() - t0)
        return result
    except Exception as exc:
        elapsed = time.perf_counter() - t0
        print(f"  [ERROR] {name} failed after {elapsed:.2f}s: {exc}")
        if required:
            traceback.print_exc()
            raise
        print("  [WARNING] Continuing without this stage output.")
        evaluator.stop_stage(name, t0)
        return None


def print_preprocessed(result: dict) -> None:
    clean = result.get("readable_sentences") or result.get("clean_sentences", [])
    semantic = result.get("semantic_sentences", [])
    print("  ▶ Readable Sentences (display / summary):")
    if not clean:
        print("      [None retained]")
    else:
        print(f"      {len(clean)} sentence(s)\n")
        for idx, sentence in enumerate(clean[:8], start=1):
            print(f"      [{idx:02d}] {sentence}")
        if len(clean) > 8:
            print(f"      ... and {len(clean) - 8} more")
    print()
    print("  ▶ Semantic Sentences (embedding / clustering):")
    print(f"      {len(semantic)} sentence(s)")
    filtered = result.get("clustering_filtered_count", 0)
    if filtered:
        print(f"  ▶ Clustering filter removed {filtered} low-information sentence(s)")


def print_summary(summary: dict) -> None:
    if not summary:
        print("  [No summary generated.]")
        return
    sections = [
        ("Executive Summary", "executive_summary", False),
        ("Key Decisions", "key_decisions", True),
        ("Action Items", "action_items", True),
        ("Critical Deadlines", "critical_deadlines", True),
        ("Major Risks / Concerns", "major_risks", True),
        ("Architecture Changes", "architecture_changes", True),
        ("Assigned Ownership", "assigned_ownership", True),
    ]
    for title, key, is_list in sections:
        print(f"  ▶ {title}:")
        value = summary.get(key)
        if is_list:
            if value:
                for item in value:
                    print(f"      • {item}")
            else:
                print("      [None detected]")
        else:
            if value:
                for line in _wrap_text(str(value), width=88):
                    print(f"      {line}")
            else:
                print("      [None generated]")
        print()


def _wrap_text(text: str, width: int = 88) -> list:
    words = text.split()
    lines, line = [], []
    for w in words:
        line.append(w)
        if len(" ".join(line)) > width:
            lines.append(" ".join(line[:-1]))
            line = [w]
    if line:
        lines.append(" ".join(line))
    return lines


def print_tasks(tasks: list) -> None:
    if not tasks:
        print("  [No action items detected.]")
        return
    print(f"  {len(tasks)} action item(s):\n")
    for idx, item in enumerate(tasks, start=1):
        assignee = item.get("assigned_to", item.get("assignee", "Unknown"))
        print(f"  [{idx}] Owner       : {assignee}")
        for t_idx, t_line in enumerate(item.get("tasks") or [], start=1):
            print(f"       Task {t_idx}    : {t_line}")
        if not item.get("tasks"):
            print(f"       Task        : {item.get('task', '—')}")
        print(f"       Deadline    : {item.get('deadline', 'Not specified')}")
        conf = item.get("confidence")
        if conf is not None:
            print(f"       Confidence  : {conf:.2f}")
        print()


def print_decisions(decisions: list) -> None:
    if not decisions:
        print("  [No decisions detected.]")
        return
    print(f"  {len(decisions)} decision(s):\n")
    for idx, item in enumerate(decisions, start=1):
        print(f"  [{idx}] {item.get('decision', '—')}")
        print(f"       Category   : {item.get('category', '—')}")
        print(f"       Trigger    : {item.get('keyword', '—')}")
        conf = item.get("confidence")
        if conf is not None:
            print(f"       Confidence : {conf:.2f}")
        print()


def print_clusters(clusters: list) -> None:
    if not clusters:
        print("  [No topic clusters generated.]")
        return
    print(f"  {len(clusters)} topic cluster(s):\n")
    for cluster in clusters:
        topic_name = cluster.get("topic_name", "Unnamed Topic")
        keywords = cluster.get("keywords", [])
        sentences = cluster.get("sentences", [])
        coh = cluster.get("coherence")
        print(f"  ▶ {topic_name}  ({len(sentences)} sentence(s))")
        if coh is not None:
            print(f"      Coherence  : {coh}")
        if keywords:
            print(f"      Keywords   : {', '.join(keywords[:6])}")
        for sentence in sentences[:6]:
            print(f"      • {sentence}")
        if len(sentences) > 6:
            print(f"      ... and {len(sentences) - 6} more")
        print()


def print_metrics_report(metrics: Dict[str, Any]) -> None:
    print_section_header("PIPELINE METRICS")
    timing = metrics.get("timing_seconds", {})
    if timing:
        print("  ▶ Stage timings (seconds):")
        for stage, sec in timing.items():
            if stage != "total":
                print(f"      {stage:22s} {sec:.2f}")
        print(f"      {'total':22s} {timing.get('total', 0):.2f}")
        print()
    clustering = metrics.get("clustering", {})
    if clustering:
        print("  ▶ Clustering:")
        print(f"      Clusters           : {clustering.get('cluster_count')}")
        print(f"      Silhouette         : {clustering.get('silhouette_score', 'n/a')}")
        print(f"      Avg coherence      : {clustering.get('avg_coherence', 'n/a')}")
        print()


def run_pipeline_from_text(
    transcript: str,
    *,
    source_label: str = "api_upload",
    num_summary_sentences: int = 3,
    num_clusters: Optional[int] = None,
    quiet: bool = True,
) -> Dict[str, Any]:
    """
    Run the same pipeline stages on raw transcript text (for FastAPI / backend).

    Does not read from disk. Set quiet=True to skip console output (default for API).
    """
    text = (transcript or "").strip()
    if not text:
        raise ValueError("Transcript text is empty.")
    return _execute_pipeline(
        text,
        source_label=source_label,
        num_summary_sentences=num_summary_sentences,
        num_clusters=num_clusters,
        quiet=quiet,
        export_dir=None,
    )


def run_pipeline(
    filepath: str,
    num_summary_sentences: int = 3,
    num_clusters: Optional[int] = None,
    export_dir: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Run full pipeline from a file path; optionally export JSON/Markdown/HTML to export_dir.
    Returns collected results dict.
    """
    transcript = load_transcript(filepath)
    return _execute_pipeline(
        transcript,
        source_label=filepath,
        num_summary_sentences=num_summary_sentences,
        num_clusters=num_clusters,
        quiet=False,
        export_dir=export_dir,
    )


def _execute_pipeline(
    transcript: str,
    *,
    source_label: str,
    num_summary_sentences: int,
    num_clusters: Optional[int],
    quiet: bool,
    export_dir: Optional[str],
) -> Dict[str, Any]:
    """Shared stage runner for CLI (file) and API (raw text)."""
    setup_nltk()
    evaluator = PipelineEvaluator()

    if not quiet:
        print_banner(source_label)
    validate_transcript(transcript, "full pipeline")

    if not quiet:
        print("\n  [SyncSpace AI] Initializing shared embedding model...")
    load_embedding_model()

    if not quiet:
        print_section_header("STAGE 1 — PREPROCESSING")
    preprocessed = _run_stage(
        evaluator, "preprocessing", lambda: preprocess_transcript(transcript)
    )
    if not quiet:
        print_preprocessed(preprocessed)

    semantic_sents = preprocessed.get("semantic_sentences") or preprocessed.get(
        "clean_sentences", []
    )

    if not quiet:
        print_section_header("STAGE 2 — ACTION ITEMS")
    validate_transcript(transcript, "action extraction")
    tasks = _run_stage(evaluator, "action_items", lambda: extract_tasks(transcript)) or []
    if not quiet:
        print_tasks(tasks)

    if not quiet:
        print_section_header("STAGE 3 — SUMMARY")
    summary = _run_stage(
        evaluator,
        "summarization",
        lambda: generate_summary(
            transcript,
            num_sentences=num_summary_sentences,
            action_items=tasks,
        ),
    ) or {}
    if not quiet:
        print_summary(summary)

    if not quiet:
        print_section_header("STAGE 4 — DECISIONS")
    decisions = _run_stage(
        evaluator,
        "decisions",
        lambda: detect_decisions(transcript),
        required=False,
    ) or []
    if not quiet:
        print_decisions(decisions)

    if not quiet:
        print_section_header("STAGE 5 — TOPIC CLUSTERS")
        if len(semantic_sents) < 3:
            print("  [WARNING] Fewer than 3 semantic sentences — clustering may be limited.")

    clusters = _run_stage(
        evaluator,
        "topic_clustering",
        lambda: cluster_topics(
            transcript,
            num_clusters=num_clusters,
            semantic_sentences=semantic_sents,
        ),
        required=False,
    ) or []
    if not quiet:
        print_clusters(clusters)

    metrics = evaluator.build_report(
        clusters=clusters,
        tasks=tasks,
        decisions=decisions,
        summary=summary,
    )
    if not quiet:
        print_metrics_report(metrics)

    payload = build_export_payload(
        transcript_path=source_label,
        summary=summary,
        tasks=tasks,
        decisions=decisions,
        clusters=clusters,
        metrics=metrics,
        preprocessed=preprocessed,
    )

    if export_dir:
        basename = os.path.splitext(os.path.basename(source_label))[0]
        paths = export_all(payload, export_dir, basename)
        if not quiet:
            print_section_header("EXPORTS")
            for fmt, path in paths.items():
                print(f"  {fmt.upper():8s} → {path}")

    if not quiet:
        print_footer()
    return payload


def _list_sample_transcripts() -> None:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    samples_dir = os.path.normpath(os.path.join(script_dir, "..", "sample_meetings"))
    print()
    print("  Optional sample transcripts (if present):")
    print()
    if not os.path.isdir(samples_dir):
        print(f"  [Directory not found: {samples_dir}]")
        return
    for filename in sorted(f for f in os.listdir(samples_dir) if f.endswith(".txt")):
        rel_path = os.path.join("..", "sample_meetings", filename)
        print(f"    python run_pipeline.py {rel_path}")
    print()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print()
        _print_thick_line()
        print("  SyncSpace AI — Meeting Intelligence Pipeline")
        _print_thick_line()
        print()
        print("  Usage:")
        print("    python run_pipeline.py <path_to_transcript.txt> [export_dir]")
        _list_sample_transcripts()
        sys.exit(0)

    transcript_path = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else None
    if out_dir is None:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        out_dir = os.path.join(script_dir, "output")
    run_pipeline(transcript_path, export_dir=out_dir)
