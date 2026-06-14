import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Video,
  CheckSquare,
  BookOpen,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { useSearch } from "@/hooks/useQueries";
import StatusBadge from "@/components/shared/StatusBadge";
import { LoadingSpinner } from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import { formatDate } from "@/lib/utils";

function ResultSection({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <div className="flex items-center gap-2">
        <span className="text-white/40">{icon}</span>
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">{title}</h3>
        <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/30 text-xs tabular-nums">
          {count}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </motion.div>
  );
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  const { data, isLoading, isFetching } = useSearch(query);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(input.trim());
  };

  const totalResults = data
    ? data.results.meetings.length +
      data.results.action_items.length +
      data.results.decisions.length +
      data.results.risks.length
    : 0;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Search</h2>
        <p className="text-sm text-white/40 mt-0.5">
          Search across meetings, tasks, decisions, and risks
        </p>
      </div>

      {/* Search input */}
      <form onSubmit={handleSearch} className="relative mb-8">
        <Search
          size={16}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30"
        />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search anything…"
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl pl-11 pr-28 py-3.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0F74C5]/50 focus:bg-white/[0.05] transition-all"
          autoFocus
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0F74C5] text-white text-sm font-medium hover:bg-[#0F74C5]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {isFetching ? <LoadingSpinner size="sm" /> : <Search size={13} />}
          Search
        </button>
      </form>

      {/* Results */}
      <AnimatePresence mode="wait">
        {!query ? (
          <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <EmptyState
              icon={<Search size={20} />}
              title="Start searching"
              description="Type to search across meetings, tasks, decisions, and risks."
            />
          </motion.div>
        ) : isLoading ? (
          <motion.div key="loading" className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </motion.div>
        ) : totalResults === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <EmptyState
              icon={<Search size={20} />}
              title={`No results for "${query}"`}
              description="Try a different search term."
            />
          </motion.div>
        ) : (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            <p className="text-xs text-white/30">
              {totalResults} result{totalResults !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
            </p>

            {/* Meetings */}
            <ResultSection
              title="Meetings"
              icon={<Video size={13} />}
              count={data?.results.meetings.length ?? 0}
            >
              {data?.results.meetings.map((m) => (
                <button
                  key={m.id}
                  onClick={() => navigate(`/meetings/${m.id}`)}
                  className="w-full text-left glass rounded-xl p-4 border border-white/[0.06] hover:border-white/[0.12] transition-all group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white group-hover:text-[#56B2EF] transition-colors truncate">
                        {m.title}
                      </p>
                      {m.summary && (
                        <p className="text-xs text-white/40 mt-0.5 line-clamp-1">
                          {m.summary}
                        </p>
                      )}
                      <p className="text-xs text-white/25 mt-1">{formatDate(m.created_at)}</p>
                    </div>
                    <ArrowRight size={14} className="text-white/20 group-hover:text-[#56B2EF] shrink-0 transition-colors" />
                  </div>
                </button>
              ))}
            </ResultSection>

            {/* Action Items */}
            <ResultSection
              title="Action Items"
              icon={<CheckSquare size={13} />}
              count={data?.results.action_items.length ?? 0}
            >
              {data?.results.action_items.map((a) => (
                <button
                  key={a.id}
                  onClick={() => navigate(`/meetings/${a.meeting_id}`)}
                  className="w-full text-left glass rounded-xl p-4 border border-white/[0.06] hover:border-white/[0.12] transition-all group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white/80 truncate">{a.task}</p>
                      <p className="text-xs text-white/25 mt-1">{formatDate(a.created_at)}</p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                </button>
              ))}
            </ResultSection>

            {/* Decisions */}
            <ResultSection
              title="Decisions"
              icon={<BookOpen size={13} />}
              count={data?.results.decisions.length ?? 0}
            >
              {data?.results.decisions.map((d) => (
                <button
                  key={d.id}
                  onClick={() => navigate(`/meetings/${d.meeting_id}`)}
                  className="w-full text-left glass rounded-xl p-4 border border-white/[0.06] hover:border-white/[0.12] transition-all group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white/80 line-clamp-2">{d.decision_text}</p>
                      {d.category && (
                        <span className="inline-block mt-1.5 px-2 py-0.5 rounded bg-[#0F74C5]/10 text-[#56B2EF] text-xs">
                          {d.category}
                        </span>
                      )}
                    </div>
                    <ArrowRight size={14} className="text-white/20 group-hover:text-[#56B2EF] shrink-0 transition-colors" />
                  </div>
                </button>
              ))}
            </ResultSection>

            {/* Risks */}
            <ResultSection
              title="Risks"
              icon={<AlertTriangle size={13} />}
              count={data?.results.risks.length ?? 0}
            >
              {data?.results.risks.map((r) => (
                <button
                  key={r.id}
                  onClick={() => navigate(`/meetings/${r.meeting_id}`)}
                  className="w-full text-left glass rounded-xl p-4 border border-white/[0.06] hover:border-white/[0.12] transition-all group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white/80 line-clamp-2">{r.risk_text}</p>
                      <span
                        className={`inline-block mt-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                          r.severity === "high"
                            ? "bg-danger/10 text-danger"
                            : r.severity === "medium"
                            ? "bg-warning/10 text-warning"
                            : "bg-success/10 text-success"
                        }`}
                      >
                        {r.severity} risk
                      </span>
                    </div>
                    <ArrowRight size={14} className="text-white/20 group-hover:text-[#56B2EF] shrink-0 transition-colors" />
                  </div>
                </button>
              ))}
            </ResultSection>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
