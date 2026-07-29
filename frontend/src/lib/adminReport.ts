/**
 * Admin Report Generator
 * Produces a clean downloadable text report from AdminReportResponse data.
 * No external PDF library needed — generates a well-formatted .txt file
 * that opens clearly in any text editor or can be printed.
 */

import type { AdminReportResponse } from "@/types";

function line(char = "─", len = 72): string {
  return char.repeat(len);
}

function padRight(str: string, width: number): string {
  return str.length >= width ? str.slice(0, width) : str + " ".repeat(width - str.length);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function generateAdminReport(data: AdminReportResponse): void {
  const { overview, member_perf, deadline_tasks, risk_summary, decisions } = data;
  const now = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const lines: string[] = [];

  const push = (...args: string[]) => lines.push(...args);

  // ── Cover ──────────────────────────────────────────────────────────────────
  push(
    line("═"),
    "  INSIGHT — ADMIN MANAGEMENT REPORT",
    `  Generated: ${now}`,
    line("═"),
    "",
  );

  // ── Overview ──────────────────────────────────────────────────────────────
  push(
    "OVERVIEW",
    line(),
    `  Team Members        : ${overview.total_members}`,
    `  Total Meetings      : ${overview.total_meetings}`,
    `  Total Tasks         : ${overview.total_tasks}`,
    `  Completed Tasks     : ${overview.completed_tasks}`,
    `  Open Tasks          : ${overview.open_tasks}`,
    `  Overdue Tasks       : ${overview.overdue_tasks}`,
    `  Cancelled Tasks     : ${overview.cancelled_tasks}`,
    `  Completion Rate     : ${overview.completion_rate}%`,
    "",
  );

  // ── Team Performance ──────────────────────────────────────────────────────
  push("TEAM PERFORMANCE", line());
  if (member_perf.length === 0) {
    push("  No member data available.", "");
  } else {
    push(
      `  ${ padRight("Member", 22) } ${ padRight("Role", 8) } ${ padRight("Assigned", 10) } ${ padRight("Completed", 11) } ${ padRight("Open", 6) } ${ padRight("Overdue", 9) } Completion`,
      `  ${ line("-", 70) }`,
    );
    for (const m of member_perf) {
      push(
        `  ${ padRight(m.display_name, 22) } ${ padRight(m.role, 8) } ${ padRight(String(m.assigned), 10) } ${ padRight(String(m.completed), 11) } ${ padRight(String(m.open), 6) } ${ padRight(String(m.overdue), 9) } ${m.completion_rate}%`
      );
    }
    push("");
  }

  // ── Deadlines ─────────────────────────────────────────────────────────────
  push("DEADLINES", line());
  const overdueTasks = deadline_tasks.filter(t => t.bucket === "overdue");
  const todayTasks   = deadline_tasks.filter(t => t.bucket === "today");
  const weekTasks    = deadline_tasks.filter(t => t.bucket === "week");

  const pushDeadlineGroup = (label: string, tasks: typeof deadline_tasks) => {
    if (tasks.length === 0) return;
    push(`  [ ${label} ]`);
    for (const t of tasks) {
      push(
        `    • ${t.task}`,
        `      Assigned: ${t.assigned_name}   Deadline: ${fmtDate(t.deadline)}   Status: ${t.status}`,
      );
    }
    push("");
  };

  pushDeadlineGroup("OVERDUE",       overdueTasks);
  pushDeadlineGroup("DUE TODAY",     todayTasks);
  pushDeadlineGroup("DUE THIS WEEK", weekTasks);

  if (deadline_tasks.length === 0) push("  No upcoming or overdue tasks.", "");

  // ── Risk Summary ──────────────────────────────────────────────────────────
  push("RISK SUMMARY", line());
  const rc = risk_summary.counts;
  push(
    `  Critical : ${rc.critical}`,
    `  High     : ${rc.high}`,
    `  Medium   : ${rc.medium}`,
    `  Low      : ${rc.low}`,
    "",
    "  Recent Risks:",
  );
  if (risk_summary.recent.length === 0) {
    push("  No risks recorded.", "");
  } else {
    for (const r of risk_summary.recent.slice(0, 10)) {
      push(
        `    [${r.severity?.toUpperCase() ?? "MEDIUM"}] ${r.risk_text}`,
        `      Meeting: ${r.meeting_title}  Date: ${fmtDate(r.created_at)}`,
      );
    }
    push("");
  }

  // ── Recent Decisions ──────────────────────────────────────────────────────
  push("RECENT DECISIONS", line());
  if (decisions.length === 0) {
    push("  No decisions recorded.", "");
  } else {
    for (const d of decisions) {
      push(
        `  • ${d.decision_text}`,
        `    Meeting: ${d.meeting_title}  Category: ${d.category ?? "—"}  Date: ${fmtDate(d.created_at)}`,
      );
    }
    push("");
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  push(
    line("═"),
    "  End of Insight Admin Report",
    line("═"),
  );

  // ── Download ──────────────────────────────────────────────────────────────
  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `insight-admin-report-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
