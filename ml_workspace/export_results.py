"""
Export SyncSpace AI pipeline results to JSON, Markdown, and HTML.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from html import escape
from typing import Any, Dict, List, Optional


def _ensure_dir(path: str) -> None:
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)


def build_export_payload(
    *,
    transcript_path: str,
    summary: Dict[str, Any],
    tasks: List[dict],
    decisions: List[dict],
    clusters: List[dict],
    metrics: Optional[Dict[str, Any]] = None,
    preprocessed: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return {
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "transcript_path": transcript_path,
            "transcript_name": os.path.basename(transcript_path),
            "pipeline": "SyncSpace AI",
        },
        "summary": summary,
        "action_items": tasks,
        "decisions": decisions,
        "topic_clusters": clusters,
        "preprocessing": {
            "readable_sentence_count": len((preprocessed or {}).get("readable_sentences", [])),
            "semantic_sentence_count": len((preprocessed or {}).get("semantic_sentences", [])),
            "filtered_count": (preprocessed or {}).get("clustering_filtered_count", 0),
        },
        "metrics": metrics or {},
    }


def export_json(payload: Dict[str, Any], output_path: str) -> str:
    _ensure_dir(output_path)
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)
    return output_path


def _bullets(items: List[str]) -> str:
    if not items:
        return "- _None detected_\n"
    return "\n".join(f"- {item}" for item in items)


def export_markdown(payload: Dict[str, Any], output_path: str) -> str:
    meta = payload.get("metadata", {})
    summary = payload.get("summary", {})
    _ensure_dir(output_path)

    lines = [
        "# SyncSpace AI — Meeting Intelligence Report",
        "",
        f"**Transcript:** `{meta.get('transcript_name', '')}`  ",
        f"**Generated:** {meta.get('generated_at', '')}",
        "",
        "## Executive Summary",
        summary.get("executive_summary") or "_No summary generated._",
        "",
        "## Key Decisions",
        _bullets(summary.get("key_decisions", [])),
        "",
        "## Action Items",
    ]

    tasks = payload.get("action_items", [])
    if not tasks:
        lines.append("- _None detected_")
    else:
        for t in tasks:
            assignee = t.get("assigned_to") or t.get("assignee", "Unassigned")
            task_list = t.get("tasks") or ([t["task"]] if t.get("task") else [])
            deadline = t.get("deadline", "Not specified")
            for task in task_list:
                line = f"- **{assignee}:** {task}"
                if deadline and deadline != "Not specified":
                    line += f" _(by {deadline})_"
                lines.append(line)

    lines.extend([
        "",
        "## Critical Deadlines",
        _bullets(summary.get("critical_deadlines", [])),
        "",
        "## Major Risks",
        _bullets(summary.get("major_risks", [])),
        "",
        "## Architecture Changes",
        _bullets(summary.get("architecture_changes", [])),
        "",
        "## Assigned Ownership",
        _bullets(summary.get("assigned_ownership", [])),
        "",
        "## Topic Clusters",
    ])

    clusters = payload.get("topic_clusters", [])
    if not clusters:
        lines.append("- _None generated_")
    else:
        for c in clusters:
            name = c.get("topic_name", "Topic")
            kws = ", ".join(c.get("keywords", [])[:6])
            lines.append(f"### {name}")
            if kws:
                lines.append(f"_Keywords:_ {kws}")
            for s in c.get("sentences", [])[:5]:
                lines.append(f"- {s}")
            if len(c.get("sentences", [])) > 5:
                lines.append(f"- _... {len(c['sentences']) - 5} more sentences_")
            lines.append("")

    metrics = payload.get("metrics", {})
    if metrics:
        lines.extend(["## Pipeline Metrics", "```json", json.dumps(metrics, indent=2), "```"])

    with open(output_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    return output_path


def export_html(payload: Dict[str, Any], output_path: str) -> str:
    meta = payload.get("metadata", {})
    summary = payload.get("summary", {})
    _ensure_dir(output_path)

    def esc_list(items: List[str]) -> str:
        if not items:
            return "<li><em>None detected</em></li>"
        return "".join(f"<li>{escape(str(x))}</li>" for x in items)

    tasks_html = ""
    for t in payload.get("action_items", []):
        assignee = escape(str(t.get("assigned_to") or t.get("assignee", "Unassigned")))
        for task in t.get("tasks") or ([t.get("task")] if t.get("task") else []):
            dl = t.get("deadline", "")
            extra = f" <em>(by {escape(dl)})</em>" if dl and dl != "Not specified" else ""
            tasks_html += f"<li><strong>{assignee}:</strong> {escape(str(task))}{extra}</li>"

    clusters_html = ""
    for c in payload.get("topic_clusters", []):
        name = escape(c.get("topic_name", "Topic"))
        kws = escape(", ".join(c.get("keywords", [])[:6]))
        clusters_html += f"<h3>{name}</h3><p><em>{kws}</em></p><ul>"
        for s in c.get("sentences", [])[:5]:
            clusters_html += f"<li>{escape(s)}</li>"
        clusters_html += "</ul>"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>SyncSpace AI Report — {escape(meta.get('transcript_name', ''))}</title>
  <style>
    body {{ font-family:Segoe UI,Arial,sans-serif; max-width:900px; margin:2rem auto; line-height:1.5; }}
    h1 {{ border-bottom:2px solid #333; }}
    h2 {{ margin-top:1.5rem; color:#1a365d; }}
    ul {{ padding-left:1.2rem; }}
  </style>
</head>
<body>
  <h1>SyncSpace AI — Meeting Intelligence Report</h1>
  <p><strong>Transcript:</strong> {escape(meta.get('transcript_name', ''))}<br/>
     <strong>Generated:</strong> {escape(meta.get('generated_at', ''))}</p>
  <h2>Executive Summary</h2>
  <p>{escape(summary.get('executive_summary') or 'No summary generated.')}</p>
  <h2>Key Decisions</h2><ul>{esc_list(summary.get('key_decisions', []))}</ul>
  <h2>Action Items</h2><ul>{tasks_html or '<li><em>None detected</em></li>'}</ul>
  <h2>Critical Deadlines</h2><ul>{esc_list(summary.get('critical_deadlines', []))}</ul>
  <h2>Major Risks</h2><ul>{esc_list(summary.get('major_risks', []))}</ul>
  <h2>Architecture Changes</h2><ul>{esc_list(summary.get('architecture_changes', []))}</ul>
  <h2>Assigned Ownership</h2><ul>{esc_list(summary.get('assigned_ownership', []))}</ul>
  <h2>Topic Clusters</h2>
  {clusters_html or '<p><em>None generated</em></p>'}
</body>
</html>"""

    with open(output_path, "w", encoding="utf-8") as fh:
        fh.write(html)
    return output_path


def export_all(
    payload: Dict[str, Any],
    output_dir: str,
    basename: str,
) -> Dict[str, str]:
    """Write JSON, Markdown, and HTML; return paths."""
    os.makedirs(output_dir, exist_ok=True)
    paths = {
        "json": export_json(payload, os.path.join(output_dir, f"{basename}.json")),
        "markdown": export_markdown(payload, os.path.join(output_dir, f"{basename}.md")),
        "html": export_html(payload, os.path.join(output_dir, f"{basename}.html")),
    }
    return paths
