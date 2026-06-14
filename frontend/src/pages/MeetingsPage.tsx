import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Video, Upload, ArrowRight, Trash2, X, Calendar, FileText } from "lucide-react";
import { useMeetings, useDeleteMeeting } from "@/hooks/useQueries";
import StatusBadge from "@/components/shared/StatusBadge";
import { MeetingCardSkeleton } from "@/components/shared/LoadingState";
import ErrorState from "@/components/shared/ErrorState";
import EmptyState from "@/components/shared/EmptyState";
import { formatDate, truncateText } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { MeetingListItem } from "@/types";

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────

function ConfirmDeleteModal({
  meeting,
  onConfirm,
  onCancel,
  loading,
}: {
  meeting: MeetingListItem;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
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
        <button onClick={onCancel} className="absolute top-4 right-4 text-white/30 hover:text-white transition-colors">
          <X size={16} />
        </button>
        <div className="w-10 h-10 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center mb-4">
          <Trash2 size={18} className="text-danger" />
        </div>
        <h3 className="text-base font-semibold text-white mb-1">Delete meeting?</h3>
        <p className="text-sm text-white/50 mb-5 leading-relaxed">
          <span className="text-white/70 font-medium">"{meeting.title}"</span> and all its insights — action items, decisions, risks, and topics — will be permanently deleted.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/60 hover:text-white text-sm transition-all">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 py-2 rounded-xl bg-danger/80 hover:bg-danger text-white text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2">
            {loading
              ? <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
              : <><Trash2 size={13} /> Delete</>
            }
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Meeting Row Card ─────────────────────────────────────────────────────────

function MeetingRow({
  meeting,
  index,
  onDelete,
}: {
  meeting: MeetingListItem;
  index: number;
  onDelete: (m: MeetingListItem) => void;
}) {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.22, delay: index * 0.03 }}
      className="glass rounded-xl p-4 border border-white/[0.06] hover:border-white/[0.12] transition-all group"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F74C5]/10 flex items-center justify-center shrink-0 mt-0.5">
          <FileText size={15} className="text-[#56B2EF]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <button
              onClick={() => navigate(`/meetings/${meeting.id}`)}
              className="text-sm font-semibold text-white hover:text-[#56B2EF] transition-colors truncate text-left"
            >
              {meeting.title}
            </button>
            <div className="flex items-center gap-1.5 shrink-0">
              <StatusBadge status={meeting.processing_status} />
              <button
                onClick={() => onDelete(meeting)}
                title="Delete this meeting"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-danger hover:bg-danger/10 transition-all opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <Calendar size={11} className="text-white/25" />
            <span className="text-xs text-white/35">{formatDate(meeting.created_at)}</span>
          </div>
          {meeting.summary && (
            <p className="text-xs text-white/40 mt-1.5 leading-relaxed">
              {truncateText(meeting.summary, 130)}
            </p>
          )}
        </div>
        <button
          onClick={() => navigate(`/meetings/${meeting.id}`)}
          className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-white/25 group-hover:text-[#56B2EF] group-hover:bg-[#0F74C5]/10 transition-all shrink-0"
        >
          <ArrowRight size={14} />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MeetingsPage() {
  const { data, isLoading, isError, error, refetch } = useMeetings();
  const deleteMeeting = useDeleteMeeting();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MeetingListItem | null>(null);

  const meetings = data?.meetings ?? [];
  const filtered = meetings.filter(
    (m) =>
      m.title.toLowerCase().includes(query.toLowerCase()) ||
      (m.summary ?? "").toLowerCase().includes(query.toLowerCase())
  );

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
    <div className="p-6 max-w-4xl mx-auto">

      {/* Confirm Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <ConfirmDeleteModal
            meeting={deleteTarget}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setDeleteTarget(null)}
            loading={deleteMeeting.isPending}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Meetings</h2>
          <p className="text-sm text-white/40 mt-0.5">
            {isLoading ? "Loading…" : `${meetings.length} meeting${meetings.length !== 1 ? "s" : ""} total`}
          </p>
        </div>
        <button
          onClick={() => navigate("/upload")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0F74C5]/15 border border-[#0F74C5]/25 text-[#56B2EF] hover:bg-[#0F74C5]/25 transition-all text-sm font-medium"
        >
          <Upload size={14} />
          Upload
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search meetings by title or summary…"
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0F74C5]/50 transition-all"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <MeetingCardSkeleton key={i} />)}
        </div>
      ) : isError ? (
        <ErrorState message={error?.message ?? "Failed to load meetings."} onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Video size={20} />}
          title={query ? "No matches found" : "No meetings yet"}
          description={query ? `No meetings match "${query}"` : "Upload your first transcript to get started."}
          action={!query ? (
            <button onClick={() => navigate("/upload")}
              className="px-4 py-2 rounded-xl bg-[#0F74C5]/15 border border-[#0F74C5]/25 text-[#56B2EF] text-sm font-medium hover:bg-[#0F74C5]/25 transition-all">
              Upload meeting
            </button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map((meeting, i) => (
              <MeetingRow key={meeting.id} meeting={meeting} index={i} onDelete={setDeleteTarget} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
