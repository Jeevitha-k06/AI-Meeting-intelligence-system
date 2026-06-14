import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Users, CheckSquare, CheckCircle2, Clock, AlertTriangle,
  TrendingUp, BookOpen, ArrowRight, Download, RefreshCw,
  ShieldCheck, Calendar, Video,
} from "lucide-react";
import { useAdminReport } from "@/hooks/useQueries";
import { Skeleton } from "@/components/shared/LoadingState";import ErrorState from "@/components/shared/ErrorState";
import { formatDate } from "@/lib/utils";
import { generateAdminReport } from "@/lib/adminReport";
import type { MemberPerf, DeadlineTask, AdminDecision } from "@/types";

// ─── Team ID (default) ────────────────────────────────────────────────────────
const DEFAULT_TEAM_ID = "fafe5280-5124-4768-80b7-aa453687b51a";

// ─── Small helpers ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-4">
      {children}
    </h3>
  );
}

function KpiCard({
  label, value, sub, icon, accent, textAccent, border, index,
}: {
  label: string; value: number | string; sub: string;
  icon: React.ReactNode; accent: string; textAccent: string; border: string; index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: index * 0.05 }}
      className={`relative overflow-hidden rounded-2xl p-5 border ${border} bg-[#000017]/60 backdrop-blur-sm group hover:scale-[1.01] transition-transform`}
    >
      <div className={`absolute inset-0 ${accent} opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-white/40 uppercase tracking-widest mb-2">{label}</p>
          <p className={`text-3xl font-bold tabular-nums ${textAccent}`}>{String(value)}</p>
          <p className="text-xs text-white/30 mt-1">{sub}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl ${accent} border ${border} flex items-center justify-center ${textAccent}`}>
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Completion bar ───────────────────────────────────────────────────────────

function CompletionBar({ pct }: { pct: number }) {
  const color = pct >= 75 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-danger";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(pct, 100)}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <span className={`text-xs tabular-nums font-semibold w-10 text-right ${
        pct >= 75 ? "text-success" : pct >= 40 ? "text-warning" : "text-danger"
      }`}>{pct}%</span>
    </div>
  );
}

// ─── Member Performance Table ─────────────────────────────────────────────────

function MemberPerfSection({ members }: { members: MemberPerf[] }) {
  if (members.length === 0) {
    return <p className="text-xs text-white/30 py-4">No member data available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[540px]">
        <thead>
          <tr className="border-b border-white/[0.05]">
            {["Member", "Assigned", "Completed", "Open", "Overdue", "Completion"].map(h => (
              <th key={h} className="text-left px-3 py-2 text-[10px] font-medium text-white/30 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m, i) => (
            <motion.tr
              key={m.user_id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
            >
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#0F74C5]/20 border border-[#0F74C5]/25 flex items-center justify-center text-[10px] font-bold text-[#56B2EF] shrink-0">
                    {m.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm text-white/80 font-medium">{m.display_name}</p>
                    <p className="text-[10px] text-white/30 capitalize">{m.role}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3 text-sm text-white/60 tabular-nums">{m.assigned}</td>
              <td className="px-3 py-3 text-sm text-success tabular-nums">{m.completed}</td>
              <td className="px-3 py-3 text-sm text-warning tabular-nums">{m.open}</td>
              <td className="px-3 py-3 text-sm text-danger tabular-nums">{m.overdue}</td>
              <td className="px-3 py-3 w-36">
                <CompletionBar pct={m.completion_rate} />
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Deadline Tasks ───────────────────────────────────────────────────────────

function DeadlineSection({ tasks }: { tasks: DeadlineTask[] }) {
  const navigate = useNavigate();
  if (tasks.length === 0) {
    return <p className="text-xs text-white/30 py-4">No upcoming or overdue tasks.</p>;
  }

  const bucketConfig = {
    overdue: { label: "Overdue",        color: "text-danger",  bg: "bg-danger/10 border-danger/20" },
    today:   { label: "Due Today",      color: "text-warning", bg: "bg-warning/10 border-warning/20" },
    week:    { label: "Due This Week",  color: "text-[#56B2EF]", bg: "bg-[#0F74C5]/10 border-[#0F74C5]/20" },
  };

  return (
    <div className="space-y-2">
      {tasks.map((t, i) => {
        const cfg = bucketConfig[t.bucket];
        return (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="flex items-start justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:border-white/[0.09] transition-all group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/80 leading-snug truncate">{t.task}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.color}`}>
                  {cfg.label}
                </span>
                <span className="text-[10px] text-white/35">{t.assigned_name}</span>
                {t.deadline && (
                  <span className={`text-[10px] flex items-center gap-0.5 ${cfg.color}`}>
                    <Calendar size={9} />
                    {formatDate(t.deadline)}
                  </span>
                )}
              </div>
            </div>
            {t.meeting_id && (
              <button
                onClick={() => navigate(`/meetings/${t.meeting_id}`)}
                title="View meeting"
                className="text-white/20 hover:text-[#56B2EF] transition-colors shrink-0 mt-0.5 opacity-0 group-hover:opacity-100"
              >
                <ArrowRight size={13} />
              </button>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Risk Summary ─────────────────────────────────────────────────────────────

function RiskSummarySection({ summary }: { summary: { counts: Record<string, number>; recent: any[] } }) {
  const navigate = useNavigate();
  const severityConfig: Record<string, { color: string; bg: string; label: string }> = {
    critical: { color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20",   label: "Critical" },
    high:     { color: "text-danger",     bg: "bg-danger/10 border-danger/20",     label: "High"     },
    medium:   { color: "text-warning",    bg: "bg-warning/10 border-warning/20",   label: "Medium"   },
    low:      { color: "text-success",    bg: "bg-success/10 border-success/20",   label: "Low"      },
  };

  const total = Object.values(summary.counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      {/* Severity counts */}
      <div className="grid grid-cols-4 gap-2">
        {(["critical", "high", "medium", "low"] as const).map(sev => {
          const cfg = severityConfig[sev];
          const count = summary.counts[sev] ?? 0;
          return (
            <div key={sev} className={`rounded-xl p-3 border ${cfg.bg} text-center`}>
              <p className={`text-xl font-bold tabular-nums ${cfg.color}`}>{count}</p>
              <p className={`text-[10px] font-medium mt-0.5 ${cfg.color}`}>{cfg.label}</p>
            </div>
          );
        })}
      </div>

      {/* Recent risk list */}
      {summary.recent.length > 0 && (
        <div className="space-y-1.5">
          {summary.recent.slice(0, 6).map((r: any) => {
            const cfg = severityConfig[r.severity?.toLowerCase()] ?? severityConfig.medium;
            return (
              <div
                key={r.id}
                className="flex items-start justify-between gap-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] group hover:border-white/[0.08] transition-all"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/70 leading-snug line-clamp-2">{r.risk_text}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <span className="text-[10px] text-white/30 truncate">{r.meeting_title}</span>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/meetings/${r.meeting_id}`)}
                  title="View meeting"
                  className="text-white/20 hover:text-[#56B2EF] transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <ArrowRight size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {total === 0 && (
        <p className="text-xs text-white/30 py-2">No risks flagged yet.</p>
      )}
    </div>
  );
}

// ─── Recent Decisions ─────────────────────────────────────────────────────────

function DecisionsSection({ decisions }: { decisions: AdminDecision[] }) {
  const navigate = useNavigate();
  if (decisions.length === 0) {
    return <p className="text-xs text-white/30 py-4">No decisions recorded yet.</p>;
  }
  return (
    <div className="space-y-2">
      {decisions.map((d, i) => (
        <motion.div
          key={d.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.03 }}
          className="flex items-start justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] group hover:border-white/[0.09] transition-all"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white/80 leading-snug line-clamp-2">{d.decision_text}</p>
            <div className="flex items-center gap-2 mt-1">
              {d.category && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0F74C5]/10 text-[#56B2EF] border border-[#0F74C5]/15">
                  {d.category}
                </span>
              )}
              <span className="text-[10px] text-white/30 truncate">{d.meeting_title}</span>
              <span className="text-[10px] text-white/25">{formatDate(d.created_at)}</span>
            </div>
          </div>
          <button
            onClick={() => navigate(`/meetings/${d.meeting_id}`)}
            title="View meeting"
            className="text-white/20 hover:text-[#56B2EF] transition-colors shrink-0 opacity-0 group-hover:opacity-100"
          >
            <ArrowRight size={13} />
          </button>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Active Members Widget ────────────────────────────────────────────────────

function ActiveMembersWidget({ members }: { members: any[] }) {
  return (
    <div className="space-y-2">
      {members.map((m, i) => {
        // Heuristic: if joined_at is within last 30 days → show as active
        const isRecent = m.joined_at
          ? (Date.now() - new Date(m.joined_at).getTime()) < 30 * 24 * 3600 * 1000
          : false;
        const roleColor = m.role === "owner" ? "text-purple-400" : m.role === "admin" ? "text-[#56B2EF]" : "text-white/40";
        return (
          <motion.div
            key={m.user_id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]"
          >
            <div className="relative shrink-0">
              <div className="w-7 h-7 rounded-full bg-[#0F74C5]/15 border border-[#0F74C5]/25 flex items-center justify-center text-[11px] font-bold text-[#56B2EF]">
                {m.display_name.charAt(0).toUpperCase()}
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#000017] ${isRecent ? "bg-success" : "bg-white/20"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/80 truncate font-medium">{m.display_name}</p>
              <p className={`text-[10px] capitalize font-medium ${roleColor}`}>{m.role}</p>
            </div>
            <span className={`text-[10px] ${isRecent ? "text-success" : "text-white/25"}`}>
              {isRecent ? "● Active" : "○ Inactive"}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Loading Skeletons ────────────────────────────────────────────────────────

function AdminSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl p-5 border border-white/[0.06] bg-[#000017]/60 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="glass rounded-2xl p-6 border border-white/[0.08] space-y-4">
        <Skeleton className="h-4 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch, isFetching } = useAdminReport(DEFAULT_TEAM_ID);

  const handleDownloadReport = () => {
    if (!data) return;
    generateAdminReport(data);
  };

  if (isLoading) return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <ShieldCheck size={20} className="text-[#56B2EF]" />
        <h2 className="text-2xl font-bold text-white">Admin Dashboard</h2>
      </div>
      <AdminSkeleton />
    </div>
  );

  if (isError) return (
    <div className="p-6 max-w-6xl mx-auto">
      <ErrorState
        message={error?.message ?? "Failed to load admin data."}
        onRetry={() => refetch()}
      />
    </div>
  );

  if (!data) return null;

  const { overview, member_perf, deadline_tasks, risk_summary, decisions, members } = data;

  const overdueCount  = deadline_tasks.filter(t => t.bucket === "overdue").length;
  const todayCount    = deadline_tasks.filter(t => t.bucket === "today").length;
  const weekCount     = deadline_tasks.filter(t => t.bucket === "week").length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 pb-16">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#0F74C5]/15 border border-[#0F74C5]/25 flex items-center justify-center">
            <ShieldCheck size={17} className="text-[#56B2EF]" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Admin Dashboard</h2>
            <p className="text-xs text-white/40 mt-0.5">Management overview · {overview.total_members} team member{overview.total_members !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/40 hover:text-white/70 text-xs transition-all"
          >
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
          <button
            onClick={handleDownloadReport}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-success/10 border border-success/20 text-success hover:bg-success/15 text-sm font-semibold transition-all"
          >
            <Download size={14} />
            Download Report
          </button>
          <button
            onClick={() => navigate("/upload")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0F74C5] hover:bg-[#0F74C5]/90 text-white text-sm font-semibold transition-all shadow-lg shadow-[#0F74C5]/20"
          >
            <Video size={14} />
            Upload Meeting
          </button>
        </div>
      </div>

      {/* ── Admin Overview KPIs ───────────────────────────────────── */}
      <section>
        <SectionTitle>Overview</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard label="Team Members"    value={overview.total_members}    sub="in this team"                  icon={<Users size={18} />}        accent="bg-purple-500/10"  textAccent="text-purple-400" border="border-purple-500/15" index={0} />
          <KpiCard label="Total Tasks"     value={overview.total_tasks}      sub={`${overview.open_tasks} open`} icon={<CheckSquare size={18} />}   accent="bg-[#0F74C5]/10"   textAccent="text-[#56B2EF]"  border="border-[#0F74C5]/15" index={1} />
          <KpiCard label="Completed"       value={overview.completed_tasks}  sub={`${overview.completion_rate}% completion rate`} icon={<CheckCircle2 size={18} />} accent="bg-success/10" textAccent="text-success" border="border-success/15" index={2} />
          <KpiCard label="Open Tasks"      value={overview.open_tasks}       sub="pending action"               icon={<Clock size={18} />}         accent="bg-warning/10"     textAccent="text-warning"    border="border-warning/15"   index={3} />
          <KpiCard label="Overdue Tasks"   value={overview.overdue_tasks}    sub="past deadline"                icon={<AlertTriangle size={18} />} accent="bg-danger/10"      textAccent="text-danger"     border="border-danger/15"    index={4} />
          <KpiCard label="Total Meetings"  value={overview.total_meetings}   sub="processed transcripts"        icon={<Video size={18} />}         accent="bg-[#0F74C5]/10"   textAccent="text-[#56B2EF]"  border="border-[#0F74C5]/15" index={5} />
        </div>
      </section>

      {/* ── Team Performance + Active Members ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team Performance */}
        <div className="lg:col-span-2 glass rounded-2xl p-6 border border-white/[0.08]">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>Team Performance</SectionTitle>
            <span className="text-[10px] text-white/25">Sorted by lowest completion first</span>
          </div>
          <MemberPerfSection members={member_perf} />
        </div>

        {/* Active Members */}
        <div className="glass rounded-2xl p-6 border border-white/[0.08]">
          <SectionTitle>Team Members</SectionTitle>
          <ActiveMembersWidget members={members} />
        </div>
      </div>

      {/* ── Deadlines ─────────────────────────────────────────────── */}
      <div className="glass rounded-2xl p-6 border border-white/[0.08]">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>Deadlines</SectionTitle>
          <div className="flex items-center gap-3 text-[10px]">
            {overdueCount > 0  && <span className="text-danger">  {overdueCount} overdue</span>}
            {todayCount > 0    && <span className="text-warning">  {todayCount} today</span>}
            {weekCount > 0     && <span className="text-[#56B2EF]">{weekCount} this week</span>}
            {deadline_tasks.length === 0 && <span className="text-white/25">All clear</span>}
          </div>
        </div>
        <DeadlineSection tasks={deadline_tasks} />
      </div>

      {/* ── Risk + Decisions ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Summary */}
        <div className="glass rounded-2xl p-6 border border-white/[0.08]">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={13} className="text-danger/70" />
            <SectionTitle>Risk Summary</SectionTitle>
          </div>
          <RiskSummarySection summary={risk_summary} />
        </div>

        {/* Recent Decisions */}
        <div className="glass rounded-2xl p-6 border border-white/[0.08]">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen size={13} className="text-[#56B2EF]/70" />
            <SectionTitle>Recent Decisions</SectionTitle>
          </div>
          <DecisionsSection decisions={decisions} />
        </div>
      </div>

      {/* ── Insight averages strip ─────────────────────────────────── */}
      {overview.total_meetings > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Avg tasks / meeting",     value: (overview.total_tasks / overview.total_meetings).toFixed(1),     color: "text-[#56B2EF]", icon: <TrendingUp size={13} /> },
            { label: "Completion rate",          value: `${overview.completion_rate}%`,                                    color: "text-success",   icon: <CheckCircle2 size={13} /> },
            { label: "Overdue rate",             value: overview.total_tasks > 0 ? `${Math.round(overview.overdue_tasks / overview.total_tasks * 100)}%` : "0%", color: "text-danger", icon: <AlertTriangle size={13} /> },
            { label: "Avg members / team",       value: overview.total_members.toString(),                                  color: "text-purple-400", icon: <Users size={13} /> },
          ].map((item, i) => (
            <div key={i} className="glass rounded-xl px-4 py-3 border border-white/[0.06] flex items-center gap-3">
              <span className={item.color}>{item.icon}</span>
              <div className="min-w-0">
                <p className={`text-lg font-bold tabular-nums ${item.color}`}>{item.value}</p>
                <p className="text-xs text-white/35 leading-tight">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 pt-2">
        <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
        <span className="text-xs text-white/25">Auto-refreshing every 60 seconds</span>
      </div>
    </div>
  );
}
