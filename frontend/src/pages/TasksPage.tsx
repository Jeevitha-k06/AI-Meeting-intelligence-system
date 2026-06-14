import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckSquare, CheckCircle2, RotateCcw, Clock, Trash2, X, Plus } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import { TableRowSkeleton, LoadingSpinner } from "@/components/shared/LoadingState";
import ErrorState from "@/components/shared/ErrorState";
import EmptyState from "@/components/shared/EmptyState";
import {
  AssigneeChip,
  DeadlineChip,
  AssignmentEditor,
} from "@/components/shared/AssignmentEditor";
import CreateTaskModal from "@/components/shared/CreateTaskModal";
import {
  useTasks,
  useUpdateTaskStatus,
  useDeleteTask,
  useCreateTask,
  useUpdateTaskAssignment,
  useTeamMembers,
  useTeamRole,
} from "@/hooks/useQueries";
import { formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { TaskStatus, TaskItem, TeamMember } from "@/types";
import { useNavigate } from "react-router-dom";

// ─── Default team ID (same as backend DEFAULT_TEAM_ID) ────────────────────────
// Tasks don't carry team_id in the list response, so we use the known team UUID.
const DEFAULT_TEAM_ID = "fafe5280-5124-4768-80b7-aa453687b51a";

type Filter = "all" | "open" | "in_progress" | "completed" | "cancelled";

const FILTERS: { label: string; value: Filter }[] = [
  { label: "All",         value: "all"        },
  { label: "Open",        value: "open"       },
  { label: "In Progress", value: "in_progress"},
  { label: "Completed",   value: "completed"  },
  { label: "Cancelled",   value: "cancelled"  },
];

// ─── Confirm Delete Modal ────────────────────────────────────────────────────

function ConfirmDeleteModal({
  task, onConfirm, onCancel, loading,
}: {
  task: TaskItem; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative glass rounded-2xl p-6 border border-white/[0.1] w-full max-w-sm shadow-2xl"
      >
        <button onClick={onCancel} className="absolute top-4 right-4 text-white/30 hover:text-white">
          <X size={16} />
        </button>
        <div className="w-10 h-10 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center mb-4">
          <Trash2 size={18} className="text-danger" />
        </div>
        <h3 className="text-base font-semibold text-white mb-1">Delete task?</h3>
        <p className="text-sm text-white/50 mb-1 line-clamp-2">
          <span className="text-white/70">"{task.task}"</span>
        </p>
        <p className="text-xs text-white/35 mb-5">This action cannot be undone.</p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/60 hover:text-white text-sm transition-all">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 py-2 rounded-xl bg-danger/80 hover:bg-danger text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 transition-all">
            {loading
              ? <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
              : <><Trash2 size={13} /> Delete</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { data, isLoading, isError, error, refetch } = useTasks();
  const updateStatus   = useUpdateTaskStatus();
  const deleteTaskMut  = useDeleteTask();
  const createTaskMut  = useCreateTask();
  const updateAssign   = useUpdateTaskAssignment();
  const navigate       = useNavigate();

  // ── Role resolution via backend (bypasses Supabase RLS) ─────────────────
  const { data: teamRoleData } = useTeamRole(DEFAULT_TEAM_ID);
  const teamRole = teamRoleData ?? null;
  const canEditAssignment = teamRole === "owner" || teamRole === "admin";

  // ── Team members for the assignee dropdown ──────────────────────────────
  const { data: membersData } = useTeamMembers(DEFAULT_TEAM_ID);
  const members: TeamMember[] = membersData?.members ?? [];

  const [filter,             setFilter]             = useState<Filter>("all");
  const [updatingId,         setUpdatingId]         = useState<string | null>(null);
  const [savingAssignmentId, setSavingAssignmentId] = useState<string | null>(null);
  const [deleteTarget,       setDeleteTarget]       = useState<TaskItem | null>(null);
  const [createModalOpen,    setCreateModalOpen]    = useState(false);

  const tasks: TaskItem[]  = data?.tasks ?? [];
  const filtered           = filter === "all" ? tasks : tasks.filter(t => t.status === filter);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    setUpdatingId(taskId);
    try {
      await updateStatus.mutateAsync({ taskId, status });
      toast({ title: "Status updated", description: `Task marked as "${status.replace("_", " ")}"` });
    } catch {
      toast({ title: "Update failed", description: "Could not update status.", variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAssignmentSave = async (
    taskId: string,
    assignedTo: string | null,
    deadline: string | null
  ) => {
    setSavingAssignmentId(taskId);
    try {
      await updateAssign.mutateAsync({ taskId, assignedTo, deadline });
      toast({ title: "Assignment updated", description: "Task ownership saved." });
    } catch {
      toast({ title: "Save failed", description: "Could not update assignment.", variant: "destructive" });
    } finally {
      setSavingAssignmentId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTaskMut.mutateAsync(deleteTarget.id);
      toast({ title: "Task deleted", description: "The action item has been removed." });
    } catch {
      toast({ title: "Delete failed", description: "Could not delete this task.", variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleCreateTask = async (payload: {
    task: string;
    meeting_id: string;
    assigned_to: string | null;
    deadline: string | null;
  }) => {
    try {
      await createTaskMut.mutateAsync(payload);
      setCreateModalOpen(false);
      toast({ title: "Task created", description: "New action item added successfully." });
    } catch {
      toast({ title: "Create failed", description: "Could not create task.", variant: "destructive" });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto">

      <AnimatePresence>
        {deleteTarget && (
          <ConfirmDeleteModal
            task={deleteTarget}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setDeleteTarget(null)}
            loading={deleteTaskMut.isPending}
          />
        )}
      </AnimatePresence>

      {/* Create Task Modal — admin/owner only */}
      <CreateTaskModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={handleCreateTask}
        members={members}
        submitting={createTaskMut.isPending}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Tasks</h2>
          <p className="text-sm text-white/40 mt-0.5">
            {isLoading
              ? "Loading…"
              : `${tasks.length} action item${tasks.length !== 1 ? "s" : ""} · ${tasks.filter(t => t.status === "completed").length} completed`}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Visual indicator when edit mode is active */}
          {canEditAssignment && (
            <span className="flex items-center gap-1.5 text-xs text-[#56B2EF]/60 border border-[#0F74C5]/20 bg-[#0F74C5]/8 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#56B2EF] animate-pulse" />
              {teamRole}
            </span>
          )}
          {/* Add Task button — admin/owner only */}
          {canEditAssignment && (
            <button
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0F74C5] hover:bg-[#0F74C5]/90 text-white text-sm font-semibold transition-all shadow-lg shadow-[#0F74C5]/15"
            >
              <Plus size={15} />
              Add Task
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 mb-6 flex-wrap">
        {FILTERS.map((f) => {
          const count = f.value === "all" ? tasks.length : tasks.filter(t => t.status === f.value).length;
          return (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                filter === f.value
                  ? "bg-[#0F74C5]/15 text-[#56B2EF] border border-[#0F74C5]/25"
                  : "text-white/40 hover:text-white hover:bg-white/[0.05] border border-transparent"
              }`}>
              {f.label}
              {!isLoading && (
                <span className={`text-xs tabular-nums ${filter === f.value ? "text-[#56B2EF]/70" : "text-white/25"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="glass rounded-2xl border border-white/[0.06] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.05]">
                {["Task","Status","Assigned To","Deadline","Meeting","Created","Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={7} />)}
            </tbody>
          </table>
        </div>
      ) : isError ? (
        <ErrorState message={error?.message} onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CheckSquare size={20} />}
          title={filter === "all" ? "No tasks yet" : `No ${filter.replace("_"," ")} tasks`}
          description="Tasks are automatically created when you upload and process a meeting transcript."
        />
      ) : (
        <div className="glass rounded-2xl border border-white/[0.06] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wider">Task</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wider w-24">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wider w-36">
                    {canEditAssignment ? "Assign / Edit" : "Assigned To"}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wider w-28">Deadline</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wider w-28 hidden md:table-cell">Meeting</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wider w-24 hidden sm:table-cell">Created</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-white/30 uppercase tracking-wider w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filtered.map((task, i) => (
                    <motion.tr
                      key={task.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors group"
                    >
                      {/* Task */}
                      <td className="px-4 py-3 text-sm text-white/80 leading-snug max-w-[260px]">
                        {task.task}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={task.status} />
                      </td>

                      {/* Assigned To — editor for admin/owner, chip for member */}
                      <td className="px-4 py-3">
                        {canEditAssignment ? (
                          <AssignmentEditor
                            taskId={task.id}
                            assignedTo={task.assigned_to}
                            deadline={task.deadline}
                            members={members}
                            onSave={handleAssignmentSave}
                            saving={savingAssignmentId === task.id}
                          />
                        ) : (
                          <AssigneeChip assignedTo={task.assigned_to} members={members} />
                        )}
                      </td>

                      {/* Deadline */}
                      <td className="px-4 py-3">
                        <DeadlineChip deadline={task.deadline} />
                      </td>

                      {/* Meeting */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <button
                          onClick={() => navigate(`/meetings/${task.meeting_id}`)}
                          className="text-xs text-[#56B2EF]/70 hover:text-[#56B2EF] transition-colors truncate max-w-[100px] block"
                          title="Open meeting"
                        >
                          {task.meeting_id.slice(0, 8)}…
                        </button>
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3 text-xs text-white/35 whitespace-nowrap hidden sm:table-cell">
                        {formatDate(task.created_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {updatingId === task.id ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            <>
                              {task.status !== "completed" && (
                                <button onClick={() => handleStatusChange(task.id, "completed")}
                                  title="Mark complete"
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-success hover:bg-success/10 transition-all">
                                  <CheckCircle2 size={14} />
                                </button>
                              )}
                              {task.status === "completed" && (
                                <button onClick={() => handleStatusChange(task.id, "open")}
                                  title="Reopen task"
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-[#56B2EF] hover:bg-[#0F74C5]/10 transition-all">
                                  <RotateCcw size={14} />
                                </button>
                              )}
                              {task.status === "open" && (
                                <button onClick={() => handleStatusChange(task.id, "in_progress")}
                                  title="Mark in progress"
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-warning hover:bg-warning/10 transition-all">
                                  <Clock size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => setDeleteTarget(task)}
                                title="Delete task"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-danger hover:bg-danger/10 transition-all opacity-0 group-hover:opacity-100">
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
