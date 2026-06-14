import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Calendar, FileText } from "lucide-react";
import StatusBadge from "./StatusBadge";
import { formatDate, truncateText } from "@/lib/utils";
import type { MeetingListItem } from "@/types";

interface MeetingCardProps {
  meeting: MeetingListItem;
  index?: number;
}

export default function MeetingCard({ meeting, index = 0 }: MeetingCardProps) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="glass rounded-xl p-5 border border-white/[0.06] hover:border-white/[0.12] transition-all duration-200 group cursor-pointer"
      onClick={() => navigate(`/meetings/${meeting.id}`)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-lg bg-[#0F74C5]/10 flex items-center justify-center shrink-0 mt-0.5">
            <FileText size={16} className="text-[#56B2EF]" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-white truncate group-hover:text-[#56B2EF] transition-colors">
              {meeting.title}
            </h3>
            <div className="flex items-center gap-2 mt-1.5">
              <Calendar size={11} className="text-white/30 shrink-0" />
              <span className="text-xs text-white/40">{formatDate(meeting.created_at)}</span>
              <span className="text-white/15">·</span>
              <StatusBadge status={meeting.processing_status} />
            </div>
            {meeting.summary && (
              <p className="text-xs text-white/40 mt-2 leading-relaxed">
                {truncateText(meeting.summary, 120)}
              </p>
            )}
          </div>
        </div>
        <button className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-white/30 group-hover:text-[#56B2EF] group-hover:bg-[#0F74C5]/10 transition-all shrink-0">
          <ArrowRight size={14} />
        </button>
      </div>
    </motion.div>
  );
}
