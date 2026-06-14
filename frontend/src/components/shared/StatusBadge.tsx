import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

const statusMap: Record<string, { label: string; className: string }> = {
  completed: { label: "Completed", className: "bg-success/10 text-success border-success/20" },
  open: { label: "Open", className: "bg-[#0F74C5]/10 text-[#56B2EF] border-[#0F74C5]/20" },
  in_progress: { label: "In Progress", className: "bg-warning/10 text-warning border-warning/20" },
  cancelled: { label: "Cancelled", className: "bg-white/5 text-white/40 border-white/10" },
  processing: { label: "Processing", className: "bg-warning/10 text-warning border-warning/20" },
  failed: { label: "Failed", className: "bg-danger/10 text-danger border-danger/20" },
  pending: { label: "Pending", className: "bg-white/5 text-white/50 border-white/10" },
};

export default function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const config = statusMap[status.toLowerCase()] ?? {
    label: status,
    className: "bg-white/5 text-white/50 border-white/10",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        config.className
      )}
    >
      {config.label}
    </span>
  );
}
