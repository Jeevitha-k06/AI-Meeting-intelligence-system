/**
 * CreateTaskModal — admin/owner-only modal for manual task creation.
 *
 * Links the new task to the most-recently-processed meeting so the
 * action_items.meeting_id FK constraint is satisfied without requiring
 * the user to pick a meeting.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, User, Calendar, AlertCircle, CheckSquare } from "lucide-react";
import type { TeamMember } from "@/types";
import { getLatestMeetingId } from "@/api/services";

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    task: string;
    meeting_id: string;
    assigned_to: string | null;
    deadline: string | null;
  }) => Promise<void>;
  members: TeamMember[];
  submitting?: boolean;
}

export default function CreateTaskModal({
  open,
  onClose,
  onSubmit,
  members,
  submitting = false,
}: CreateTaskModalProps) {
  const [taskText,    setTaskText]    = useState("");
  const [assignee,    setAssignee]    = useState<string>("");
  const [deadline,    setDeadline]    = useState("");
  const [meetingId,   setMeetingId]   = useState<string | null>(null);
  const [fetchingMtg, setFetchingMtg] = useState(false);
  const [error,       setError]       = useState("");

  // Fetch the latest meeting id as soon as the modal opens
  useEffect(() => {
    if (!open) return;
    setFetchingMtg(true);
    getLatestMeetingId()
      .then(id => setMeetingId(id))
      .catch(() => setMeetingId(null))
      .finally(() => setFetchingMtg(false));
  }, [open]);

  // Reset form when closed
  useEffect(() => {
    if (!open) {
      setTaskText("");
      setAssignee("");
      setDeadline("");
      setError("");
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!taskText.trim()) {
      setError("Task description is required.");
      return;
    }
    if (!meetingId) {
      setError("No meeting found to link this task to. Please upload at least one meeting first.");
      return;
    }

    const deadlineIso = deadline
      ? new Date(deadline + "T00:00:00Z").toISOString()
      : null;

    await onSubmit({
      task: taskText.trim(),
      meeting_id: meetingId,
      assigned_to: assignee || null,
      deadline: deadlineIso,
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            className="relative w-full max-w-md rounded-2xl border border-white/[0.12] shadow-2xl overflow-hidden"
            style={{ background: "#0a0a1a" }}   /* solid — no bleed-through */
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#0F74C5]/15 border border-[#0F74C5]/25 flex items-center justify-center">
                  <Plus size={15} className="text-[#56B2EF]" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Add Task</h3>
                  <p className="text-[11px] text-white/35">Manually create an action item</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/35 hover:text-white hover:bg-white/[0.06] transition-all"
              >
                <X size={15} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

              {/* Task description */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckSquare size={11} />
                  Task Description <span className="text-danger">*</span>
                </label>
                <textarea
                  value={taskText}
                  onChange={e => setTaskText(e.target.value)}
                  placeholder="e.g. Configure PostgreSQL read replicas by Friday"
                  rows={3}
                  disabled={submitting}
                  className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0F74C5]/50 focus:bg-white/[0.08] transition-all resize-none"
                />
              </div>

              {/* Assign To */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                  <User size={11} />
                  Assign To <span className="text-white/25">(optional)</span>
                </label>
                <select
                  value={assignee}
                  onChange={e => setAssignee(e.target.value)}
                  disabled={submitting}
                  className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#0F74C5]/50 transition-all [color-scheme:dark] appearance-none cursor-pointer"
                >
                  <option value="">— Unassigned —</option>
                  {members.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Deadline */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={11} />
                  Deadline <span className="text-white/25">(optional)</span>
                </label>
                <input
                  type="date"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  disabled={submitting}
                  className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#0F74C5]/50 transition-all [color-scheme:dark]"
                />
              </div>

              {/* Meeting link indicator */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${meetingId ? "bg-success" : fetchingMtg ? "bg-warning animate-pulse" : "bg-danger"}`} />
                <p className="text-[11px] text-white/40 leading-tight">
                  {fetchingMtg
                    ? "Finding latest meeting…"
                    : meetingId
                    ? "Task will be linked to the latest meeting"
                    : "No meeting found — upload a transcript first"}
                </p>
              </div>

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-danger/8 border border-danger/20 text-danger text-xs"
                >
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </motion.div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/60 hover:text-white text-sm transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || fetchingMtg || !taskText.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0F74C5] hover:bg-[#0F74C5]/90 text-white text-sm font-semibold transition-all disabled:opacity-50"
                >
                  {submitting ? (
                    <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  ) : (
                    <>
                      <Plus size={14} />
                      Create Task
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
