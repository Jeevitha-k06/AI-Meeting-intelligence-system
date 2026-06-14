import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color?: "blue" | "green" | "yellow" | "red" | "purple";
  trend?: string;
  index?: number;
}

const colorMap = {
  blue: {
    icon: "bg-[#0F74C5]/15 text-[#56B2EF]",
    border: "border-[#0F74C5]/15",
  },
  green: {
    icon: "bg-success/10 text-success",
    border: "border-success/10",
  },
  yellow: {
    icon: "bg-warning/10 text-warning",
    border: "border-warning/10",
  },
  red: {
    icon: "bg-danger/10 text-danger",
    border: "border-danger/10",
  },
  purple: {
    icon: "bg-purple-500/10 text-purple-400",
    border: "border-purple-500/10",
  },
};

export default function MetricCard({
  label,
  value,
  icon,
  color = "blue",
  trend,
  index = 0,
}: MetricCardProps) {
  const colors = colorMap[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={cn(
        "glass rounded-xl p-5 border hover:border-white/[0.12] transition-all duration-200 group",
        colors.border
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">
            {label}
          </p>
          <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
          {trend && <p className="text-xs text-white/40 mt-1.5">{trend}</p>}
        </div>
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110",
            colors.icon
          )}
        >
          {icon}
        </div>
      </div>
    </motion.div>
  );
}
