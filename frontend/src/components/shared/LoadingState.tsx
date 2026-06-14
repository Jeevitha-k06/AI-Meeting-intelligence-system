import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-lg shimmer-bg bg-white/[0.04]",
        className
      )}
    />
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="glass rounded-xl p-5 border border-white/[0.06]">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="w-10 h-10 rounded-xl" />
      </div>
    </div>
  );
}

export function MeetingCardSkeleton() {
  return (
    <div className="glass rounded-xl p-5 border border-white/[0.06]">
      <div className="flex items-start gap-3">
        <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
      </div>
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-b border-white/[0.04]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  const sizeClass = {
    sm: "w-4 h-4 border-2",
    md: "w-6 h-6 border-2",
    lg: "w-10 h-10 border-2",
  };
  return (
    <div
      className={cn(
        "rounded-full border-white/10 border-t-[#56B2EF] animate-spin",
        sizeClass[size],
        className
      )}
    />
  );
}

export default function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <LoadingSpinner size="lg" />
      <p className="text-sm text-white/40">{message}</p>
    </div>
  );
}
