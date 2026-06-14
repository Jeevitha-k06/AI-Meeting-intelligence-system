import { AlertCircle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({
  message = "Something went wrong.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-12 h-12 rounded-2xl bg-danger/5 border border-danger/15 flex items-center justify-center">
        <AlertCircle size={20} className="text-danger" />
      </div>
      <p className="text-sm text-white/50 max-w-xs text-center">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.08] transition-all text-sm mt-1"
        >
          <RefreshCw size={13} />
          Try again
        </button>
      )}
    </div>
  );
}
