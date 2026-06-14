/**
 * MemberDashboardPage — shown to users with role = "member".
 * Contains the full existing dashboard PLUS a personal "My Tasks" widget.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video, CheckSquare, CheckCircle2, Clock, BookOpen, AlertTriangle,
  Upload, RefreshCw, TrendingUp, ArrowRight, Activity, Trash2, X,
} from "lucide-react";
import { useDashboardStats, useDeleteMeeting, useTasks } from "@/hooks/useQueries";
import { useAuth } from "@/context/AuthContext";
import { MetricCardSkeleton, MeetingCardSkeleton, Skeleton } from "@/components/shared/LoadingState";
import ErrorState from "@/components/shared/ErrorState";
import EmptyState from "@/components/shared/EmptyState";
import StatusBadge from "@/components/shared/StatusBadge";
import { DeadlineChip } from "@/components/shared/AssignmentEditor";
import { formatDate, formatDateTime, truncateText } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { MeetingListItem, TaskItem } from "@/types";

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────

function ConfirmDeleteModal({ title, onConfirm, onCancel, loading }: {
  title: string; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative glass rounded-2xl p-6 border border-white/[0.1] w-full max-w-sm shadow-2xl">
        <button onClick={onCancel} className="absolute top-4 right-4 text-white/30 hover:text-white"><X size={16} /></button>
        <div className="w-10 h-10 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center mb-4">
          <Trash2 size={18} className="text-danger" />
        </div>
        <h3 className="text-base font-semibold text-white mb-1">Delete meeting?</h3>
        <p className="text-sm text-white/50 mb-5"><span className="text-white/70 font-medium">"{title}"</span> and all its insights will be permanently removed.</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/60 hover:text-white text-sm transition-all">Cancel</button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 py-2 rounded-xl bg-danger/80 hover:bg-danger text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 transition-all">
            {loading ? <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" /> : <><Trash2 size={13} /> Delete</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Meeting Card with Delete ─────────────────────────────────────────────────

function DashMeetingCard({ meeting, index, onDelete }: {
  meeting: MeetingListItem; index: number; onDelete: (m: MeetingListItem) => void;
}) {
  const navigate = useNavigate();
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.22, delay: index * 0.04 }}
      className="glass rounded-xl p-4 border border-white/[0.06] hover:border-white/[0.1] transition-all group">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F74C5]/10 flex items-center justify-center shrink-0 mt-0.5">
          <Video size={15} className="text-[#56B2EF]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <button onClick={() => navigate(`/meetings/${meeting.id}`)}
              className="text-sm font-semibold text-white hover:text-[#56B2EF] transition-colors truncate text-left">
              {meeting.title}
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <StatusBadge status={meeting.processing_status} />
              <button onClick={() => onDelete(meeting)} title="Delete meeting"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-danger hover:bg-danger/10 transition-all opacity-0 group-hover:opacity-100">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          <p className="text-xs text-white/35 mt-0.5">{formatDate(meeting.created_at)}</p>
          {meeting.summary && (
            <p className="text-xs text-white/40 mt-1.5 leading-relaxed">{truncateText(meeting.summary, 110)}</p>
          )}
        </div>
      </div>
      <div className="flex justify-end mt-2">
        <button onClick={() => navigate(`/meetings/${meeting.id}`)}
          className="text-xs text-white/25 hover:text-[#56B2EF] transition-colors flex items-center gap-1">
          View analysis <ArrowRight size={10} />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, sub, accent, textAccent, border, index }: {
  label: string; value: number; icon: React.ReactNode; sub: string;
  accent: string; textAccent: string; border: string; index: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06 }}
      className={`relative overflow-hidden rounded-2xl p-5 border ${border} bg-[#000017]/60 backdrop-blur-sm group hover:scale-[1.01] transition-transform`}>
      <div className={`absolute inset-0 ${accent} opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-white/40 uppercase tracking-widest mb-2">{label}</p>
          <p className={`text-3xl font-bold tabular-nums ${textAccent}`}>{value.toLocaleString()}</p>
          <p className="text-xs text-white/30 mt-1">{sub}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl ${accent} border ${border} flex items-center justify-center ${textAccent}`}>{icon}</div>
      </div>
    </motion.div>
  );
}

// ─── Task Ring ────────────────────────────────────────────────────────────────

function TaskRing({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const r = 36; const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
        <motion.circle cx="48" cy="48" r={r} fill="none" stroke="url(#ring-grad-m)" strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.4 }} transform="rotate(-90 48 48)" />
        <defs>
          <linearGradient id="ring-grad-m" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0F74C5" /><stop offset="100%" stopColor="#6FD3FF" />
          </linearGradient>
        </defs>
        <text x="48" y="44" textAnchor="middle" fill="white" fontSize="14" fontWeight="700">{pct}%</text>
        <text x="48" y="60" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="9">done</text>
      </svg>
      <div className="text-center">
        <p className="text-xs text-white/40">Task completion</p>
        <p className="text-sm font-semibold text-white tabular-nums">{completed} / {total}</p>
      </div>
    </div>
  );
}

function RiskBar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/50">{label}</span>
        <span className="text-white/70 tabular-nums font-medium">{count}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div className={`h-full rounded-full ${color}`} initial={{ width: 0 }}
          animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: "easeOut", delay: 0.5 }} />
      </div>
    </div>
  );
}

function ActivitySparkline({ meetings }: { meetings: { created_at: string }[] }) {
  const now = new Date();
  const buckets = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (6 - i));
    return { date: d.toDateString(), count: 0 };
  });
  meetings.forEach(m => {
    const d = new Date(m.created_at).toDateString();
    const b = buckets.find(bk => bk.date === d);
    if (b) b.count++;
  });
  const max = Math.max(...buckets.map(b => b.count), 1);
  const W = 180, H = 40;
  const pts = buckets.map((b, i) => {
    const x = (i / (buckets.length - 1)) * W;
    const y = H - (b.count / max) * (H - 4) - 2;
    return `${x},${y}`;
  });
  const area = `${pts[0].split(",")[0]},${H} ${pts.join(" ")} ${W},${H}`;
  return (
    <div className="flex flex-col gap-1">
      <svg width={W} height={H} className="overflow-visible">
        <defs>
          <linearGradient id="spark-fill-m" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0F74C5" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0F74C5" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#spark-fill-m)" />
        <polyline points={pts.join(" ")} fill="none" stroke="#56B2EF" strokeWidth="1.5" strokeLinejoin="round" />
        {buckets.map((b, i) => {
          const x = (i / (buckets.length - 1)) * W;
          const y = H - (b.count / max) * (H - 4) - 2;
          return b.count > 0 ? <circle key={i} cx={x} cy={y} r="2.5" fill="#6FD3FF" /> : null;
        })}
      </svg>
      <div className="flex justify-between">
        {buckets.map((b, i) => (
          <span key={i} className="text-[9px] text-white/20">
            {new Date(b.date).toLocaleDateString("en", { weekday: "narrow" })}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── My Tasks Widget ──────────────────────────────────────────────────────────

function MyTasksWidget({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const { data, isLoading } = useTasks();

  const now = new Date();

  const myTasks: TaskItem[] = (data?.tasks ?? []).filter(t => t.assigned_to === userId);
  const open      = myTasks.filter(t => t.status === "open" || t.status === "in_progress");
  const completed = myTasks.filter(t => t.status === "completed");
  const overdue   = myTasks.filter(t => {
    if (t.status === "completed" || t.status === "cancelled") return false;
    if (!t.deadline) return false;
    try { return new Date(t.deadline) < now; } catch { return false; }
  });
  const upcoming  = myTasks.filter(t => {
    if (t.status === "completed" || t.status === "cancelled") return false;
    if (!t.deadline) return false;
    try {
      const dl = new Date(t.deadline);
      const diff = dl.getTime() - now.getTime();
      return diff > 0 && diff <= 7 * 24 * 3600 * 1000;
    } catch { return false; }
  });

  if (isLoading) {
    return (
      <div className="glass rounded-2xl p-6 border border-white/[0.08] space-y-3">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-4">My Tasks</p>
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (myTasks.length === 0) {
    return (
      <div className="glass rounded-2xl p-6 border border-white/[0.08]">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-4">My Tasks</p>
        <EmptyState icon={<CheckSquare size={18} />}
          title="No tasks assigned to you"
          description="Tasks assigned to you during meetings will appear here." />
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-6 border border-white/[0.08]">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-widest">My Tasks</p>
        <button onClick={() => navigate("/tasks")}
          className="text-xs text-[#56B2EF] hover:text-[#6FD3FF] flex items-center gap-1 transition-colors">
          View all <ArrowRight size={11} />
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { label: "Open",      count: open.length,      color: "bg-warning/10 text-warning border-warning/20"   },
          { label: "Completed", count: completed.length,  color: "bg-success/10 text-success border-success/20"   },
          { label: "Overdue",   count: overdue.length,    color: "bg-danger/10 text-danger border-danger/20"       },
          { label: "Due Soon",  count: upcoming.length,   color: "bg-[#0F74C5]/10 text-[#56B2EF] border-[#0F74C5]/20" },
        ].map(s => (
          <span key={s.label} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${s.color}`}>
            {s.label} <span className="tabular-nums font-bold">{s.count}</span>
          </span>
        ))}
      </div>

      {/* Overdue tasks first */}
      {overdue.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-danger/70 uppercase tracking-wider mb-1.5 font-medium">Overdue</p>
          <div className="space-y-1.5">
            {overdue.slice(0, 3).map(t => (
              <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-danger/5 border border-danger/15">
                <p className="text-xs text-white/75 truncate flex-1">{t.task}</p>
                <DeadlineChip deadline={t.deadline} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming tasks */}
      {upcoming.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-[#56B2EF]/70 uppercase tracking-wider mb-1.5 font-medium">Due This Week</p>
          <div className="space-y-1.5">
            {upcoming.slice(0, 3).map(t => (
              <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#0F74C5]/5 border border-[#0F74C5]/15">
                <p className="text-xs text-white/75 truncate flex-1">{t.task}</p>
                <DeadlineChip deadline={t.deadline} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Open tasks */}
      {open.length > 0 && overdue.length === 0 && upcoming.length === 0 && (
        <div className="space-y-1.5">
          {open.slice(0, 5).map(t => (
            <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <p className="text-xs text-white/75 truncate flex-1">{t.task}</p>
              <StatusBadge status={t.status} />
            </div>
          ))}
        </div>
      )}

      {open.length === 0 && overdue.length === 0 && upcoming.length === 0 && (
        <div className="flex items-center gap-2 py-2">
          <CheckCircle2 size={14} className="text-success" />
          <p className="text-xs text-success">All tasks completed — great work!</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MemberDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useDashboardStats();
  const deleteMeeting = useDeleteMeeting();

  const [deleteTarget, setDeleteTarget] = useState<MeetingListItem | null>(null);

  const stats = data?.stats;
  const meetings = data?.recent_meetings ?? [];
  const completionRate = stats && stats.total_tasks > 0
    ? Math.round((stats.completed_tasks / stats.total_tasks) * 100) : 0;

  const getMeetingsSub = () => {
    if (!stats) return "";
    if (stats.total_meetings === 0) return "Upload your first transcript";
    return `${meetings.length} recent · all time`;
  };
  const getTasksSub = () => {
    if (!stats) return "";
    if (stats.total_tasks === 0) return "No action items extracted yet";
    return `${stats.pending_tasks} pending · ${stats.completed_tasks} completed`;
  };
  const getCompletionSub = () => {
    if (!stats || stats.total_tasks === 0) return "No tasks yet";
    return `${completionRate}% of all tasks done`;
  };
  const getPendingSub = () => {
    if (!stats) return "";
    if (stats.pending_tasks === 0) return "All tasks resolved";
    return `${stats.pending_tasks} awaiting action`;
  };
  const getDecisionsSub = () => {
    if (!stats) return "";
    if (stats.total_decisions === 0) return "No decisions recorded yet";
    const avg = stats.total_meetings > 0 ? (stats.total_decisions / stats.total_meetings).toFixed(1) : "0";
    return `${avg} per meeting on average`;
  };
  const getRisksSub = () => {
    if (!stats) return "";
    if (stats.total_risks === 0) return "No risks flagged yet";
    const avg = stats.total_meetings > 0 ? (stats.total_risks / stats.total_meetings).toFixed(1) : "0";
    return `${avg} flagged per meeting`;
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMeeting.mutateAsync(deleteTarget.id);
      toast({ title: "Meeting deleted", description: `"${deleteTarget.title}" has been removed.` });
    } catch {
      toast({ title: "Delete failed", description: "Could not delete this meeting.", variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-7">

      <AnimatePresence>
        {deleteTarget && (
          <ConfirmDeleteModal title={deleteTarget.title}
            onConfirm={handleDeleteConfirm} onCancel={() => setDeleteTarget(null)}
            loading={deleteMeeting.isPending} />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Welcome back <span className="text-gradient">👋</span></h2>
          <p className="text-sm text-white/40 mt-0.5">
            {dataUpdatedAt ? `Last updated ${formatDateTime(new Date(dataUpdatedAt).toISOString())}` : "Connecting to backend…"}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={() => refetch()} disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all text-xs">
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
          <button onClick={() => navigate("/upload")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0F74C5] hover:bg-[#0F74C5]/90 text-white text-sm font-semibold transition-all shadow-lg shadow-[#0F74C5]/20">
            <Upload size={14} /> Upload Meeting
          </button>
        </div>
      </div>

      {isError && (
        <ErrorState message={`Backend unreachable — ${error?.message ?? "Network Error"}. Start the FastAPI server on http://127.0.0.1:8000`}
          onRetry={() => refetch()} />
      )}

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Total Meetings"  value={stats.total_meetings}  icon={<Video size={18} />}        sub={getMeetingsSub()}    accent="bg-[#0F74C5]/10"  textAccent="text-[#56B2EF]"  border="border-[#0F74C5]/15"  index={0} />
          <StatCard label="Action Items"    value={stats.total_tasks}     icon={<CheckSquare size={18} />}  sub={getTasksSub()}       accent="bg-purple-500/10" textAccent="text-purple-400"  border="border-purple-500/15" index={1} />
          <StatCard label="Completed Tasks" value={stats.completed_tasks} icon={<CheckCircle2 size={18} />} sub={getCompletionSub()}  accent="bg-success/10"    textAccent="text-success"    border="border-success/15"    index={2} />
          <StatCard label="Pending Tasks"   value={stats.pending_tasks}   icon={<Clock size={18} />}        sub={getPendingSub()}     accent="bg-warning/10"    textAccent="text-warning"    border="border-warning/15"    index={3} />
          <StatCard label="Decisions"       value={stats.total_decisions} icon={<BookOpen size={18} />}     sub={getDecisionsSub()}   accent="bg-[#0F74C5]/10"  textAccent="text-[#56B2EF]"  border="border-[#0F74C5]/15"  index={4} />
          <StatCard label="Risks Flagged"   value={stats.total_risks}     icon={<AlertTriangle size={18} />} sub={getRisksSub()}      accent="bg-danger/10"     textAccent="text-danger"     border="border-danger/15"     index={5} />
        </div>
      ) : null}

      {/* Analytics Row */}
      {!isLoading && stats && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass rounded-2xl p-5 border border-white/[0.08] flex items-center justify-center gap-6">
            <TaskRing completed={stats.completed_tasks} total={stats.total_tasks} />
            <div className="space-y-3">
              {[
                { label: "Completed", color: "bg-[#0F74C5]", val: stats.completed_tasks },
                { label: "Pending",   color: "bg-warning",   val: stats.pending_tasks   },
                { label: "Total",     color: "bg-white/20",  val: stats.total_tasks     },
              ].map(r => (
                <div key={r.label} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${r.color}`} />
                  <span className="text-white/50 text-xs">{r.label}</span>
                  <span className="ml-auto text-white tabular-nums font-semibold text-sm">{r.val}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="glass rounded-2xl p-5 border border-white/[0.08] space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-danger/70" />
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Intelligence Overview</p>
            </div>
            {stats.total_meetings === 0 ? (
              <p className="text-xs text-white/30 py-4 text-center">Upload meetings to see data</p>
            ) : (
              <div className="space-y-3">
                <RiskBar label="Risks identified"   count={stats.total_risks}     max={Math.max(stats.total_risks, stats.total_decisions, 1)} color="bg-danger" />
                <RiskBar label="Decisions recorded" count={stats.total_decisions} max={Math.max(stats.total_risks, stats.total_decisions, 1)} color="bg-[#56B2EF]" />
                <div className="pt-1 border-t border-white/[0.06]">
                  <p className="text-xs text-white/30">Across {stats.total_meetings} meeting{stats.total_meetings !== 1 ? "s" : ""} processed</p>
                </div>
              </div>
            )}
          </div>
          <div className="glass rounded-2xl p-5 border border-white/[0.08] space-y-3">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-[#56B2EF]/70" />
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">7-Day Activity</p>
            </div>
            {meetings.length === 0 ? (
              <p className="text-xs text-white/30 py-4 text-center">No recent meetings</p>
            ) : (
              <ActivitySparkline meetings={meetings} />
            )}
            <p className="text-xs text-white/30">{meetings.length} meeting{meetings.length !== 1 ? "s" : ""} in the last 7 days</p>
          </div>
        </motion.div>
      )}

      {/* Insight averages */}
      {!isLoading && stats && stats.total_meetings > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Avg tasks per meeting",     value: (stats.total_tasks / stats.total_meetings).toFixed(1),      color: "text-[#56B2EF]", icon: <TrendingUp size={13} />    },
            { label: "Avg decisions per meeting", value: (stats.total_decisions / stats.total_meetings).toFixed(1),  color: "text-success",   icon: <BookOpen size={13} />      },
            { label: "Avg risks per meeting",     value: (stats.total_risks / stats.total_meetings).toFixed(1),      color: "text-danger",    icon: <AlertTriangle size={13} /> },
            { label: "Task completion rate",      value: `${completionRate}%`,                                        color: "text-warning",   icon: <CheckCircle2 size={13} />  },
          ].map((item, i) => (
            <div key={i} className="glass rounded-xl px-4 py-3 border border-white/[0.06] flex items-center gap-3">
              <span className={item.color}>{item.icon}</span>
              <div className="min-w-0">
                <p className={`text-lg font-bold tabular-nums ${item.color}`}>{item.value}</p>
                <p className="text-xs text-white/35 leading-tight">{item.label}</p>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* My Tasks Widget — only for this member */}
      {user && (
        <MyTasksWidget userId={user.id} />
      )}

      {/* Recent Meetings */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest">Recent Meetings</h3>
          <button onClick={() => navigate("/meetings")}
            className="text-xs text-[#56B2EF] hover:text-[#6FD3FF] transition-colors flex items-center gap-1">
            View all <ArrowRight size={11} />
          </button>
        </div>
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <MeetingCardSkeleton key={i} />)}</div>
        ) : meetings.length === 0 ? (
          <EmptyState icon={<Video size={20} />} title="No meetings yet"
            description="Upload your first transcript to start generating insights."
            action={
              <button onClick={() => navigate("/upload")}
                className="px-4 py-2 rounded-xl bg-[#0F74C5]/15 border border-[#0F74C5]/25 text-[#56B2EF] text-sm font-medium hover:bg-[#0F74C5]/25 transition-all">
                Upload meeting
              </button>
            } />
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {meetings.map((m, i) => (
                <DashMeetingCard key={m.id} meeting={m} index={i} onDelete={setDeleteTarget} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      <div className="flex items-center gap-2 pt-2">
        <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
        <span className="text-xs text-white/25">Auto-refreshing every 30 seconds</span>
      </div>
    </div>
  );
}
