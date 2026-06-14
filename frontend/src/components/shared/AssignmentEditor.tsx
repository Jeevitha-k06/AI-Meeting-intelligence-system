/**
 * AssignmentEditor — inline assignee dropdown + deadline date input.
 *
 * Rendered inside the action-items table on MeetingDetailPage and TasksPage.
 * Only shown to admins/owners; members see read-only display.
 */
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, Calendar, ChevronDown, Check, X } from "lucide-react";
import type { TeamMember } from "@/types";
import { formatDate } from "@/lib/utils";

// ─── Assignee chip (read-only) ─────────────────────────────────────────────

export function AssigneeChip({
  assignedTo,
  members,
}: {
  assignedTo: string | null;
  members: TeamMember[];
}) {
  if (!assignedTo) {
    return <span className="text-xs text-white/25 italic">Unassigned</span>;
  }
  const member = members.find((m) => m.user_id === assignedTo);
  const name = member?.display_name ?? assignedTo.slice(0, 8) + "…";
  const initial = name.charAt(0).toUpperCase();

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-5 h-5 rounded-full bg-[#0F74C5]/20 border border-[#0F74C5]/30 flex items-center justify-center text-[9px] font-bold text-[#56B2EF] shrink-0">
        {initial}
      </span>
      <span className="text-xs text-white/65 truncate max-w-[90px]">{name}</span>
    </span>
  );
}

// ─── Deadline chip (read-only) ─────────────────────────────────────────────

export function DeadlineChip({ deadline }: { deadline: string | null }) {
  if (!deadline) {
    return <span className="text-xs text-white/25 italic">No deadline</span>;
  }

  const date = new Date(deadline);
  const now = new Date();
  const isOverdue = date < now;
  const isSoon = !isOverdue && date.getTime() - now.getTime() < 1000 * 60 * 60 * 24 * 3; // 3 days

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${
        isOverdue
          ? "text-danger"
          : isSoon
          ? "text-warning"
          : "text-white/50"
      }`}
    >
      <Calendar size={11} className="shrink-0" />
      {formatDate(deadline)}
    </span>
  );
}

// ─── Editor (admin/owner only) ─────────────────────────────────────────────

interface AssignmentEditorProps {
  taskId: string;
  assignedTo: string | null;
  deadline: string | null;
  members: TeamMember[];
  onSave: (taskId: string, assignedTo: string | null, deadline: string | null) => Promise<void>;
  saving?: boolean;
}

export function AssignmentEditor({
  taskId,
  assignedTo,
  deadline,
  members,
  onSave,
  saving = false,
}: AssignmentEditorProps) {
  const [open, setOpen] = useState(false);
  const [localAssignee, setLocalAssignee] = useState<string | null>(assignedTo);
  const [localDeadline, setLocalDeadline] = useState<string>(
    deadline ? deadline.slice(0, 10) : "" // "YYYY-MM-DD" for <input type="date">
  );
  const ref = useRef<HTMLDivElement>(null);

  // Sync if parent updates
  useEffect(() => {
    setLocalAssignee(assignedTo);
    setLocalDeadline(deadline ? deadline.slice(0, 10) : "");
  }, [assignedTo, deadline]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSave = async () => {
    // Convert YYYY-MM-DD → ISO UTC string, or null to clear
    const deadlineIso = localDeadline
      ? new Date(localDeadline + "T00:00:00Z").toISOString()
      : null;
    await onSave(taskId, localAssignee, deadlineIso);
    setOpen(false);
  };

  const handleClear = async () => {
    setLocalAssignee(null);
    setLocalDeadline("");
    await onSave(taskId, null, null);
    setOpen(false);
  };

  const currentMember = members.find((m) => m.user_id === localAssignee);

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:border-[#0F74C5]/30 hover:bg-[#0F74C5]/8 transition-all text-xs text-white/50 hover:text-white/80"
        title="Edit assignment"
      >
        <User size={11} />
        <span className="max-w-[80px] truncate">
          {currentMember?.display_name ?? "Assign"}
        </span>
        <ChevronDown size={10} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute z-[999] top-full mt-1.5 right-0 w-64 rounded-xl border border-white/20 shadow-[0_16px_40px_rgba(0,0,0,0.9)] p-3 space-y-3 bg-[#0a0a1a]"
          >
            {/* Assignee picker */}
            <div>
              <p className="text-[10px] font-medium text-white/50 uppercase tracking-wider mb-1.5">
                Assign to
              </p>
              <div className="space-y-0.5 max-h-36 overflow-y-auto">
                <button
                  onClick={() => setLocalAssignee(null)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all ${
                    localAssignee === null
                      ? "bg-[#1a1a2e] text-white border border-[#0F74C5]/30"
                      : "text-white/70 hover:bg-[#131324] hover:text-white border border-transparent"
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <User size={9} className="text-white/50" />
                  </div>
                  <span>Unassigned</span>
                  {localAssignee === null && <Check size={11} className="ml-auto text-[#56B2EF]" />}
                </button>
                {members.map((m) => (
                  <button
                    key={m.user_id}
                    onClick={() => setLocalAssignee(m.user_id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all ${
                      localAssignee === m.user_id
                        ? "bg-[#0F74C5]/20 text-[#56B2EF] border border-[#0F74C5]/30"
                        : "text-white/70 hover:bg-[#131324] hover:text-white border border-transparent"
                    }`}
                  >
                    <div className="w-5 h-5 rounded-full bg-[#0F74C5]/20 border border-[#0F74C5]/25 flex items-center justify-center text-[9px] font-bold text-[#56B2EF] shrink-0">
                      {m.display_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate">{m.display_name}</span>
                    {localAssignee === m.user_id && (
                      <Check size={11} className="ml-auto shrink-0 text-[#56B2EF]" />
                    )}
                  </button>
                ))}
                {members.length === 0 && (
                  <p className="text-xs text-white/25 px-2 py-1">No team members found</p>
                )}
              </div>
            </div>

            {/* Deadline picker */}
            <div>
              <p className="text-[10px] font-medium text-white/50 uppercase tracking-wider mb-1.5">
                Deadline
              </p>
              <input
                type="date"
                value={localDeadline}
                onChange={(e) => setLocalDeadline(e.target.value)}
                className="w-full bg-[#131324] border border-white/20 hover:border-white/30 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#0F74C5]/60 transition-all [color-scheme:dark]"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-0.5">
              <button
                onClick={handleClear}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1a1a2e] border border-white/10 text-white/70 hover:text-white hover:bg-[#23233b] text-xs transition-all"
                title="Clear assignment"
              >
                <X size={10} />
                Clear
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg bg-[#0F74C5] hover:bg-[#0F74C5]/90 text-white text-xs font-semibold transition-all disabled:opacity-60 shadow-md"
              >
                {saving ? (
                  <div className="w-3 h-3 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                ) : (
                  <>
                    <Check size={10} />
                    Save
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
