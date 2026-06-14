import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Brain, Sparkles } from "lucide-react";

const STAGES = [
  { label: "Uploading file", duration: 800 },
  { label: "Extracting text", duration: 1200 },
  { label: "Preprocessing transcript", duration: 1500 },
  { label: "Generating summary", duration: 2500 },
  { label: "Extracting action items", duration: 2000 },
  { label: "Detecting decisions", duration: 1800 },
  { label: "Analyzing risks", duration: 1500 },
  { label: "Clustering topics", duration: 2000 },
  { label: "Saving to database", duration: 1000 },
];

interface ProcessingProgressProps {
  uploadProgress: number; // 0–100 from axios
  isComplete?: boolean;
}

export default function ProcessingProgress({
  uploadProgress,
  isComplete = false,
}: ProcessingProgressProps) {
  const [currentStage, setCurrentStage] = useState(0);
  const [fakeProgress, setFakeProgress] = useState(0);

  // Once upload is done, walk through the fake stages
  useEffect(() => {
    if (uploadProgress < 100) return;

    let stageIdx = 1; // start after upload stage
    const timers: ReturnType<typeof setTimeout>[] = [];
    let accumulated = 0;

    STAGES.slice(1).forEach((stage, i) => {
      accumulated += stage.duration;
      const t = setTimeout(() => {
        setCurrentStage(stageIdx + i);
      }, accumulated);
      timers.push(t);
    });

    return () => timers.forEach(clearTimeout);
  }, [uploadProgress]);

  // Smooth fake progress bar
  useEffect(() => {
    if (isComplete) {
      setFakeProgress(100);
      return;
    }

    // During upload: mirror real progress up to 30%
    if (uploadProgress < 100) {
      setFakeProgress(Math.round(uploadProgress * 0.3));
      return;
    }

    // After upload: animate from 30% → 95% over ~14s
    const totalDuration = STAGES.slice(1).reduce((a, s) => a + s.duration, 0);
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const ratio = Math.min(elapsed / totalDuration, 1);
      // eased from 30 → 95
      setFakeProgress(Math.round(30 + ratio * 65));
      if (ratio >= 1) clearInterval(interval);
    }, 80);

    return () => clearInterval(interval);
  }, [uploadProgress, isComplete]);

  const displayStage = isComplete ? "Analysis complete" : STAGES[Math.min(currentStage, STAGES.length - 1)].label;
  const displayProgress = isComplete ? 100 : fakeProgress;

  return (
    <div className="w-full space-y-4">
      {/* Icon + label */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#0F74C5]/15 border border-[#0F74C5]/20 flex items-center justify-center">
          {isComplete ? (
            <Sparkles size={16} className="text-[#56B2EF]" />
          ) : (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <Brain size={16} className="text-[#56B2EF]" />
            </motion.div>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-white">{displayStage}</p>
          <p className="text-xs text-white/40">
            {isComplete ? "All done" : "Processing with AI pipeline…"}
          </p>
        </div>
        <span className="ml-auto text-sm font-semibold text-[#56B2EF] tabular-nums">
          {displayProgress}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#0F74C5] to-[#6FD3FF]"
          animate={{ width: `${displayProgress}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>

      {/* Stage dots */}
      {!isComplete && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {STAGES.map((stage, i) => (
            <div
              key={i}
              className={`flex items-center gap-1 text-xs transition-all duration-300 ${
                i < currentStage
                  ? "text-success"
                  : i === currentStage
                  ? "text-[#56B2EF]"
                  : "text-white/20"
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i < currentStage
                    ? "bg-success"
                    : i === currentStage
                    ? "bg-[#56B2EF] animate-pulse"
                    : "bg-white/15"
                }`}
              />
              {i === currentStage && <span>{stage.label}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
