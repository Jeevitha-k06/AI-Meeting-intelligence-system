import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { DecisionRecord } from "@/types";

interface DecisionCardProps {
  decision: DecisionRecord;
  index?: number;
}

export default function DecisionCard({ decision, index = 0 }: DecisionCardProps) {
  const confidence = decision.confidence != null ? Math.round(decision.confidence * 100) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="glass rounded-xl p-4 border border-white/[0.06] hover:border-white/[0.1] transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#0F74C5]/10 flex items-center justify-center shrink-0 mt-0.5">
          <CheckCircle2 size={15} className="text-[#56B2EF]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white leading-relaxed">{decision.decision_text}</p>
          <div className="flex items-center gap-3 mt-2.5 flex-wrap">
            {decision.category && (
              <span className="px-2 py-0.5 rounded-md bg-[#0F74C5]/10 text-[#56B2EF] text-xs border border-[#0F74C5]/15">
                {decision.category}
              </span>
            )}
            {confidence != null && (
              <span className="text-xs text-white/35">
                {confidence}% confidence
              </span>
            )}
            <span className="text-xs text-white/30 ml-auto">{formatDate(decision.created_at)}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
