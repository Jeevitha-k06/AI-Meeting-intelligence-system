import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  CheckCircle2,
  X,
  ArrowRight,
  AlertCircle,
  FileCheck,
} from "lucide-react";
import { uploadMeeting } from "@/api/services";
import ProcessingProgress from "@/components/shared/ProcessingProgress";
import type { UploadMeetingResponse } from "@/types";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/useQueries";

type UploadState = "idle" | "uploading" | "processing" | "success" | "error";

export default function UploadPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<UploadMeetingResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const f = acceptedFiles[0];
    if (f) {
      setFile(f);
      setTitle(f.name.replace(/\.[^/.]+$/, ""));
      setUploadState("idle");
      setResult(null);
      setErrorMsg("");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/plain": [".txt"],
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxFiles: 1,
    multiple: false,
  });

  const handleUpload = async () => {
    if (!file) return;
    setErrorMsg("");
    setUploadState("uploading");
    setUploadProgress(0);

    try {
      const data = await uploadMeeting(file, title || undefined, undefined, (p) => {
        setUploadProgress(p);
        if (p >= 100) setUploadState("processing");
      });

      setUploadState("success");
      setResult(data);
      setUploadProgress(100);
      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings });
    } catch (err: unknown) {
      const isTimeout =
        err instanceof Error &&
        ((err as Error & { isTimeout?: boolean }).isTimeout === true ||
          err.message === "timeout");

      if (isTimeout) {
        // Pipeline finished on the backend but axios timed out waiting for
        // the response. Poll /meetings until the newest one is "completed".
        setUploadState("processing");
        setUploadProgress(95);

        const found = await pollForCompletion();
        if (found) {
          setResult(found);
          setUploadState("success");
          setUploadProgress(100);
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
          queryClient.invalidateQueries({ queryKey: queryKeys.meetings });
        } else {
          // Still nothing after polling — very long pipeline or real failure
          setUploadState("error");
          setErrorMsg(
            "Analysis is taking longer than expected. Check the Meetings page — your result may already be ready."
          );
        }
      } else {
        setUploadState("error");
        setErrorMsg(
          err instanceof Error ? err.message : "Upload failed. Please try again."
        );
      }
    }
  };

  /** Poll GET /meetings up to 20 times (every 3 s) looking for a completed meeting
   *  whose title matches what we just uploaded. Returns a synthetic result object
   *  if found, null if the timeout is exhausted. */
  const pollForCompletion = async (): Promise<UploadMeetingResponse | null> => {
    const { getMeetings } = await import("@/api/services");
    const uploadedTitle = (title || file?.name?.replace(/\.[^/.]+$/, "") || "").toLowerCase();
    const maxAttempts = 20;
    const intervalMs = 3000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((res) => setTimeout(res, intervalMs));
      try {
        const response = await getMeetings();
        const match = response.meetings.find(
          (m) =>
            m.processing_status === "completed" &&
            m.title.toLowerCase() === uploadedTitle
        );
        if (match) {
          return {
            success: true,
            meeting_id: match.id,
            summary: match.summary ?? "",
            // Counts not available from list endpoint — set 0, detail page has real values
            action_items_count: 0,
            decisions_count: 0,
            risks_count: 0,
            topic_clusters_count: 0,
          };
        }
        // bump the fake progress bar slightly so it doesn't look frozen
        setUploadProgress((p) => Math.min(p + 1, 99));
      } catch {
        // network blip — keep trying
      }
    }
    return null;
  };

  const handleReset = () => {
    setFile(null);
    setTitle("");
    setUploadState("idle");
    setUploadProgress(0);
    setResult(null);
    setErrorMsg("");
  };

  const isProcessing = uploadState === "uploading" || uploadState === "processing";

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Upload Meeting</h2>
        <p className="text-sm text-white/40 mt-0.5">
          Upload a transcript and Insight will extract the intelligence
        </p>
      </div>

      <AnimatePresence mode="wait">
        {/* SUCCESS STATE */}
        {uploadState === "success" && result ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="glass rounded-2xl p-8 border border-success/20 space-y-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                <CheckCircle2 size={20} className="text-success" />
              </div>
              <div>
                <p className="text-base font-semibold text-white">Analysis complete</p>
                <p className="text-sm text-white/40">
                  Your meeting has been processed successfully
                </p>
              </div>
            </div>

            {/* Summary preview */}
            {result.summary && (
              <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
                  Summary
                </p>
                <p className="text-sm text-white/80 leading-relaxed">{result.summary}</p>
              </div>
            )}

            {/* Counts */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Action Items", value: result.action_items_count, color: "text-[#56B2EF]" },
                { label: "Decisions", value: result.decisions_count, color: "text-success" },
                { label: "Risks", value: result.risks_count, color: "text-danger" },
                { label: "Topics", value: result.topic_clusters_count, color: "text-purple-400" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06] text-center"
                >
                  <p className={`text-2xl font-bold tabular-nums ${item.color}`}>
                    {item.value}
                  </p>
                  <p className="text-xs text-white/40 mt-0.5">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => navigate(`/meetings/${result.meeting_id}`)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0F74C5] hover:bg-[#0F74C5]/90 text-white text-sm font-semibold transition-all"
              >
                View Analysis
                <ArrowRight size={15} />
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.08] transition-all text-sm"
              >
                Upload Another
              </button>
            </div>
          </motion.div>
        ) : (
          /* UPLOAD FORM */
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Dropzone */}
            <div
              {...getRootProps()}
              className={`relative rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
                isDragActive
                  ? "border-[#0F74C5]/60 bg-[#0F74C5]/5"
                  : file
                  ? "border-[#0F74C5]/30 bg-[#0F74C5]/5"
                  : "border-white/[0.1] hover:border-white/[0.2] bg-white/[0.02] hover:bg-white/[0.03]"
              } ${isProcessing ? "pointer-events-none opacity-70" : ""}`}
            >
              <input {...getInputProps()} />

              <AnimatePresence mode="wait">
                {file ? (
                  <motion.div
                    key="file"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center gap-3"
                  >
                    <div className="w-12 h-12 rounded-xl bg-[#0F74C5]/15 flex items-center justify-center">
                      <FileCheck size={22} className="text-[#56B2EF]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{file.name}</p>
                      <p className="text-xs text-white/40 mt-0.5">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    {!isProcessing && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReset();
                        }}
                        className="text-xs text-white/30 hover:text-danger transition-colors flex items-center gap-1"
                      >
                        <X size={12} />
                        Remove
                      </button>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center gap-3"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white/[0.05] flex items-center justify-center">
                      <Upload size={22} className="text-white/30" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white/70">
                        {isDragActive ? "Drop it here" : "Drop your transcript here"}
                      </p>
                      <p className="text-xs text-white/30 mt-1">
                        or click to browse · PDF, DOCX, TXT
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Title input */}
            {file && !isProcessing && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                <label className="text-xs font-medium text-white/40 uppercase tracking-wider mb-1.5 block">
                  Meeting Title
                </label>
                <div className="relative">
                  <FileText size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Q3 Planning Sprint"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0F74C5]/50 transition-all"
                  />
                </div>
              </motion.div>
            )}

            {/* Processing progress */}
            {isProcessing && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-2xl p-5 border border-white/[0.08]"
              >
                <ProcessingProgress uploadProgress={uploadProgress} />
              </motion.div>
            )}

            {/* Error */}
            {uploadState === "error" && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-danger/5 border border-danger/15 text-danger text-sm"
              >
                <AlertCircle size={15} />
                {errorMsg}
              </motion.div>
            )}

            {/* Upload button */}
            {file && !isProcessing && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={handleUpload}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0F74C5] hover:bg-[#0F74C5]/90 text-white text-sm font-semibold transition-all"
              >
                <Upload size={15} />
                Process Meeting
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
