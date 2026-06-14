import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Calendar,
  FileText,
  CheckSquare,
  BookOpen,
  AlertTriangle,
  Hash,
  ChevronDown,
  ChevronUp,
  Trash2,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import {
  useMeetingDetail,
  useUpdateTaskStatus,
  useUpdateTaskAssignment,
  useTeamMembers,
  useTeamRole,
} from "@/hooks/useQueries";
import StatusBadge from "@/components/shared/StatusBadge";
import DecisionCard from "@/components/shared/DecisionCard";
import RiskCard from "@/components/shared/RiskCard";
import TopicClusterCard from "@/components/shared/TopicClusterCard";
import { LoadingSpinner } from "@/components/shared/LoadingState";
import ErrorState from "@/components/shared/ErrorState";
import EmptyState from "@/components/shared/EmptyState";
import {
  AssigneeChip,
  DeadlineChip,
  AssignmentEditor,
} from "@/components/shared/AssignmentEditor";
import { formatDateTime } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { TaskStatus, TeamMember } from "@/types";

// ─── Section Header ────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-7 h-7 rounded-lg bg-white/[0.05] flex items-center justify-center text-white/50">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-white/80">{title}</h3>
      {count !== undefined && (
        <span className="ml-1 px-2 py-0.5 rounded-full bg-white/[0.06] text-white/40 text-xs tabular-nums">
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useMeetingDetail(id!);
  const updateStatus = useUpdateTaskStatus();
  const updateAssignment = useUpdateTaskAssignment();

  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [savingAssignmentId, setSavingAssignmentId] = useState<string | null>(null);

  // Load team members and role — both wait for data?.meeting.team_id
  const teamId = data?.meeting.team_id ?? "";
  const { data: membersData } = useTeamMembers(teamId);
  const { data: teamRoleData } = useTeamRole(teamId);
  const members: TeamMember[] = membersData?.members ?? [];
  const teamRole = teamRoleData ?? null;
  const canEditAssignment = teamRole === "owner" || teamRole === "admin";

  const handleStatusUpdate = async (taskId: string, status: TaskStatus) => {
    setUpdatingTaskId(taskId);
    try {
      await updateStatus.mutateAsync({ taskId, status });
      toast({ title: "Status updated", description: `Task marked as ${status.replace("_", " ")}` });
    } catch {
      toast({ title: "Update failed", description: "Could not update task status.", variant: "destructive" });
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleAssignmentSave = async (
    taskId: string,
    assignedTo: string | null,
    deadline: string | null
  ) => {
    setSavingAssignmentId(taskId);
    try {
      await updateAssignment.mutateAsync({ taskId, assignedTo, deadline });
      toast({ title: "Assignment updated", description: "Task ownership saved." });
    } catch {
      toast({ title: "Save failed", description: "Could not update assignment.", variant: "destructive" });
    } finally {
      setSavingAssignmentId(null);
    }
  };

  // ── Loading / Error states ───────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-white/[0.04] animate-pulse" />
          <div className="h-5 w-48 rounded bg-white/[0.04] animate-pulse" />
        </div>
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft size={15} />
          Back
        </button>
        <ErrorState message={error?.message} onRetry={() => refetch()} />
      </div>
    );
  }

  if (!data) return null;

  const { meeting, action_items, decisions, risks, topic_clusters } = data;

  return (
    <div className="p-6 max-w-4xl mx-auto pb-16">
      {/* Back */}
      <button
        onClick={() => navigate("/meetings")}
        className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6 transition-colors"
      >
        <ArrowLeft size={15} />
        Back to meetings
      </button>

      {/* ── Section 1: Meeting Overview ────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-6 border border-white/[0.08] mb-6"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white leading-snug">{meeting.title}</h2>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-white/40">
                <Calendar size={12} />
                {formatDateTime(meeting.created_at)}
              </div>
              {meeting.uploaded_file_name && (
                <div className="flex items-center gap-1.5 text-xs text-white/30">
                  <FileText size={12} />
                  {meeting.uploaded_file_name}
                </div>
              )}
            </div>
          </div>
          <StatusBadge status={meeting.processing_status} size="md" />
        </div>

        {meeting.summary ? (
          <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.05]">
            <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Summary</p>
            <p className="text-sm text-white/75 leading-relaxed">{meeting.summary}</p>
          </div>
        ) : (
          <p className="text-sm text-white/30 italic">No summary available.</p>
        )}
      </motion.div>

      {/* ── Section 2: Action Items ─────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass rounded-2xl p-6 border border-white/[0.08] mb-6"
      >
        <div className="flex items-center justify-between mb-4">
          <SectionHeader icon={<CheckSquare size={14} />} title="Action Items" count={action_items.length} />
          {canEditAssignment && action_items.length > 0 && (
            <span className="text-[10px] text-white/25 italic">
              You can reassign tasks as {teamRole}
            </span>
          )}
        </div>

        {action_items.length === 0 ? (
          <EmptyState
            icon={<CheckSquare size={18} />}
            title="No action items"
            description="No action items were extracted from this meeting."
          />
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full min-w-[680px]">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-white/30 uppercase tracking-wider">
                    Task
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-white/30 uppercase tracking-wider w-24">
                    Status
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-white/30 uppercase tracking-wider w-32">
                    Assigned To
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-white/30 uppercase tracking-wider w-28">
                    Deadline
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-white/30 uppercase tracking-wider w-28">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {action_items.map((item, i) => (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors group"
                  >
                    <td className="px-4 py-3 text-sm text-white/80 leading-snug">
                      {item.task}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>

                    {/* Assigned To */}
                    <td className="px-4 py-3">
                      {canEditAssignment ? (
                        <AssignmentEditor
                          taskId={item.id}
                          assignedTo={item.assigned_to}
                          deadline={item.deadline}
                          members={members}
                          onSave={handleAssignmentSave}
                          saving={savingAssignmentId === item.id}
                        />
                      ) : (
                        <AssigneeChip assignedTo={item.assigned_to} members={members} />
                      )}
                    </td>

                    {/* Deadline */}
                    <td className="px-4 py-3">
                      {!canEditAssignment && (
                        <DeadlineChip deadline={item.deadline} />
                      )}
                      {canEditAssignment && (
                        /* deadline shown inside AssignmentEditor dropdown;
                           show read-only chip here when not editing */
                        <DeadlineChip deadline={item.deadline} />
                      )}
                    </td>

                    {/* Row Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {updatingTaskId === item.id ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          <>
                            {item.status !== "completed" && (
                              <button
                                onClick={() => handleStatusUpdate(item.id, "completed")}
                                title="Mark complete"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-success hover:bg-success/10 transition-all"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                            )}
                            {item.status === "completed" && (
                              <button
                                onClick={() => handleStatusUpdate(item.id, "open")}
                                title="Reopen"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-[#56B2EF] hover:bg-[#0F74C5]/10 transition-all"
                              >
                                <RotateCcw size={14} />
                              </button>
                            )}
                            {/* Delete — disabled: no endpoint on this page */}
                            <button
                              disabled
                              title="Delete (use Tasks page)"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/10 cursor-not-allowed opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* ── Section 3: Decisions ───────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="glass rounded-2xl p-6 border border-white/[0.08] mb-6"
      >
        <SectionHeader icon={<BookOpen size={14} />} title="Decisions" count={decisions.length} />
        {decisions.length === 0 ? (
          <EmptyState icon={<BookOpen size={18} />} title="No decisions recorded" description="No decisions were detected in this meeting." />
        ) : (
          <div className="space-y-3">
            {decisions.map((d, i) => <DecisionCard key={d.id} decision={d} index={i} />)}
          </div>
        )}
      </motion.div>

      {/* ── Section 4: Risks ───────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.11 }}
        className="glass rounded-2xl p-6 border border-white/[0.08] mb-6"
      >
        <SectionHeader icon={<AlertTriangle size={14} />} title="Risks" count={risks.length} />
        {risks.length === 0 ? (
          <EmptyState icon={<AlertTriangle size={18} />} title="No risks identified" description="No risks were flagged in this meeting." />
        ) : (
          <div className="space-y-3">
            {risks.map((r, i) => <RiskCard key={r.id} risk={r} index={i} />)}
          </div>
        )}
      </motion.div>

      {/* ── Section 5: Topic Clusters ──────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14 }}
        className="glass rounded-2xl p-6 border border-white/[0.08] mb-6"
      >
        <SectionHeader icon={<Hash size={14} />} title="Topic Clusters" count={topic_clusters.length} />
        {topic_clusters.length === 0 ? (
          <EmptyState icon={<Hash size={18} />} title="No topics clustered" description="No topic clusters were generated for this meeting." />
        ) : (() => {
          const sorted = [...topic_clusters].sort((a, b) => (b.coherence ?? 0) - (a.coherence ?? 0));
          const strong = sorted.filter((tc) => tc.keywords.length >= 1 || (tc.coherence ?? 0) >= 0.3);
          if (strong.length === 0) {
            return <EmptyState icon={<Hash size={18} />} title="No strong discussion themes detected" description="No strong discussion themes were detected in this meeting." />;
          }
          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {strong.map((tc, i) => (
                <TopicClusterCard key={tc.id} cluster={tc} index={i} totalClusters={strong.length} />
              ))}
            </div>
          );
        })()}
      </motion.div>

      {/* ── Section 6: Transcript ──────────────────────────────── */}
      {meeting.transcript_text && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.17 }}
          className="glass rounded-2xl border border-white/[0.08]"
        >
          <button
            onClick={() => setTranscriptOpen(!transcriptOpen)}
            className="w-full flex items-center justify-between p-6 text-left hover:bg-white/[0.02] transition-colors rounded-2xl"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white/[0.05] flex items-center justify-center text-white/50">
                <FileText size={14} />
              </div>
              <span className="text-sm font-semibold text-white/80">Transcript</span>
            </div>
            {transcriptOpen ? <ChevronUp size={15} className="text-white/30" /> : <ChevronDown size={15} className="text-white/30" />}
          </button>

          <AnimatePresence>
            {transcriptOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-6 pb-6 border-t border-white/[0.05] pt-4">
                  <pre className="text-xs text-white/50 leading-relaxed whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
                    {meeting.transcript_text}
                  </pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
