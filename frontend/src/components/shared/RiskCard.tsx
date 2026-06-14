import { motion } from "framer-motion";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { RiskRecord } from "@/types";

interface RiskCardProps {
  risk: RiskRecord;
  index?: number;
}

const severityConfig = {
  high: {
    icon: <AlertCircle size={15} />,
    className: "bg-danger/10 text-danger border-danger/15",
    label: "High",
  },
  medium: {
    icon: <AlertTriangle size={15} />,
    className: "bg-warning/10 text-warning border-warning/15",
    label: "Medium",
  },
  low: {
    icon: <Info size={15} />,
    className: "bg-success/10 text-success border-success/15",
    label: "Low",
  },
};

export default function RiskCard({ risk, index = 0 }: RiskCardProps) {
  const severity = risk.severity?.toLowerCase() as keyof typeof severityConfig;
  const config = severityConfig[severity] ?? severityConfig.medium;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="glass rounded-xl p-4 border border-white/[0.06] hover:border-white/[0.1] transition-all"
    >
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${config.className}`}>
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white leading-relaxed">{risk.risk_text}</p>
          <div className="flex items-center gap-3 mt-2.5">
            <span className={`px-2 py-0.5 rounded-md text-xs border font-medium ${config.className}`}>
              {config.label} Risk
            </span>
            <span className="text-xs text-white/30 ml-auto">{formatDate(risk.created_at)}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
