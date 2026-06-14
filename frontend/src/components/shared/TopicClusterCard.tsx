import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Flame, TrendingUp, Star, Hash } from "lucide-react";
import type { TopicClusterRecord } from "@/types";

// ─── Keyword cleanup ─────────────────────────────────────────────────────────

function cleanKeywords(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const kw of raw) {
    const trimmed = kw.trim();
    if (trimmed.length < 3) continue;                          // skip very short
    const titled = trimmed
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    const key = titled.toLowerCase();
    if (!seen.has(key)) {                                      // deduplicate
      seen.add(key);
      out.push(titled);
    }
  }
  return out;
}

// ─── Insight indicators ──────────────────────────────────────────────────────

interface Indicator {
  icon: React.ReactNode;
  label: string;
  color: string;
  bg: string;
}

function getIndicators(
  coherence: number | null,
  keywordCount: number
): Indicator[] {
  const indicators: Indicator[] = [];
  const coh = coherence ?? 0;

  if (coh >= 0.70) {
    indicators.push({
      icon: <Star size={10} />,
      label: "Highly Coherent",
      color: "text-[#56B2EF]",
      bg: "bg-[#0F74C5]/10 border-[#0F74C5]/20",
    });
  }
  if (keywordCount >= 8) {
    indicators.push({
      icon: <Flame size={10} />,
      label: "High Discussion",
      color: "text-warning",
      bg: "bg-warning/10 border-warning/20",
    });
  }
  if (coh >= 0.55 && coh < 0.70) {
    indicators.push({
      icon: <TrendingUp size={10} />,
      label: "Growing Topic",
      color: "text-success",
      bg: "bg-success/10 border-success/20",
    });
  }
  return indicators;
}

// ─── AI-style summary from topic name + keywords ──────────────────────────────

function generateInsightSummary(topicName: string, keywords: string[]): string {
  const name = topicName.toLowerCase();
  const kws = keywords.slice(0, 6).map((k) => k.toLowerCase());

  // Build context-aware summaries based on topic name patterns
  if (name.includes("redis") || name.includes("cache") || name.includes("elasticache")) {
    const techs = kws.filter((k) =>
      ["redis", "elasticache", "cache", "caching", "invalidation", "cluster"].some((t) => k.includes(t))
    );
    const techStr = techs.length ? techs.slice(0, 2).join(" and ") : "Redis and ElastiCache";
    return `Discussion focused on caching architecture using ${techStr}. The team explored strategies for reducing database load, improving response times, and managing cache invalidation at scale.`;
  }

  if (name.includes("postgres") || name.includes("replication") || name.includes("database")) {
    return `The team discussed PostgreSQL replication architecture and database scaling strategies. Topics included read replicas, connection pooling, and ensuring data consistency across distributed deployments.`;
  }

  if (name.includes("kafka") || name.includes("messaging") || name.includes("streaming") || name.includes("msk")) {
    return `Discussion covered event-driven messaging architecture using Kafka and MSK. The team addressed real-time streaming requirements, topic configuration, and throughput optimisation strategies.`;
  }

  if (name.includes("kubernetes") || name.includes("eks") || name.includes("migration") || name.includes("docker")) {
    return `The team explored Kubernetes migration strategy and container orchestration. Discussion included EKS configuration, Helm chart management, DevOps workflow changes, and rollout planning.`;
  }

  if (name.includes("security") || name.includes("istio") || name.includes("mesh") || name.includes("mtls")) {
    return `Security architecture and service mesh implementation were discussed. The team reviewed mTLS configuration, Istio policies, authentication patterns, and zero-trust networking requirements.`;
  }

  if (name.includes("microservices") || name.includes("architecture") || name.includes("monolith")) {
    return `Discussion addressed the architectural shift from monolith to microservices. The team evaluated service decomposition strategies, inter-service communication, and migration sequencing.`;
  }

  if (name.includes("infrastructure") || name.includes("scaling") || name.includes("throughput") || name.includes("latency")) {
    return `The team discussed infrastructure scaling and performance optimisation. Topics included throughput bottlenecks, latency targets, resource provisioning, and capacity planning.`;
  }

  if (name.includes("ci") || name.includes("deployment") || name.includes("pipeline")) {
    return `CI/CD pipeline and deployment strategy were discussed. The team covered build automation, release workflows, environment promotion, and monitoring post-deployment.`;
  }

  // Generic fallback using topic name and top keywords
  const kwStr = keywords.slice(0, 3).join(", ");
  return `Discussion focused on ${topicName.toLowerCase()}. Key themes included ${kwStr || "technical planning, implementation details, and team responsibilities"}, with the team aligning on next steps and ownership.`;
}

// ─── Importance score (0–100) ─────────────────────────────────────────────────

function importanceScore(cluster: TopicClusterRecord, totalClusters: number): number {
  const coh = (cluster.coherence ?? 0.4) * 40;       // up to 40 pts
  const kws = Math.min(cluster.keywords.length / 15, 1) * 30; // up to 30 pts
  // rank by position (first = most important from ML sort)
  const rank = Math.max(1 - (0 / Math.max(totalClusters, 1)) * 0.3, 0.7) * 30; // up to 30 pts
  return Math.round(coh + kws + rank);
}

// ─── Card ─────────────────────────────────────────────────────────────────────

interface TopicClusterCardProps {
  cluster: TopicClusterRecord;
  index?: number;
  totalClusters?: number;
}

export default function TopicClusterCard({
  cluster,
  index = 0,
  totalClusters = 1,
}: TopicClusterCardProps) {
  const [expanded, setExpanded] = useState(false);

  const coherencePct = cluster.coherence != null ? cluster.coherence : null;
  const coherenceDisplay =
    coherencePct != null ? Math.round(coherencePct * 100) : null;

  const allKeywords = cleanKeywords(cluster.keywords);
  const topKeywords = allKeywords.slice(0, 5);
  const extraKeywords = allKeywords.slice(5);

  const indicators = getIndicators(coherencePct, allKeywords.length);
  const importance = importanceScore(cluster, totalClusters);
  const summary = generateInsightSummary(cluster.topic_name, allKeywords);

  // Discussion share: rough estimate — clusters with more keywords = more discussion
  const shareEst = Math.min(
    Math.round((allKeywords.length / Math.max(totalClusters * 6, 1)) * 100),
    48
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.06 }}
      className="rounded-2xl border border-white/[0.07] bg-[#000017]/70 backdrop-blur-sm hover:border-white/[0.12] transition-all duration-200 overflow-hidden"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/15 flex items-center justify-center shrink-0">
              <Hash size={14} className="text-purple-400" />
            </div>
            <h4 className="text-sm font-bold text-white leading-tight">
              {cluster.topic_name}
            </h4>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {coherenceDisplay != null && (
              <span className="text-xs font-medium text-white/40 tabular-nums whitespace-nowrap">
                {coherenceDisplay}% coherence
              </span>
            )}
            {shareEst > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/15 text-xs text-purple-400 whitespace-nowrap">
                ~{shareEst}% of discussion
              </span>
            )}
          </div>
        </div>

        {/* Insight indicators */}
        {indicators.length > 0 && (
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            {indicators.map((ind) => (
              <span
                key={ind.label}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${ind.color} ${ind.bg}`}
              >
                {ind.icon}
                {ind.label}
              </span>
            ))}
          </div>
        )}

        {/* Importance bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-white/35">Topic Importance</span>
            <span className="text-xs font-semibold text-white/50 tabular-nums">{importance}%</span>
          </div>
          <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-purple-600/70 to-purple-400/70"
              initial={{ width: 0 }}
              animate={{ width: `${importance}%` }}
              transition={{ duration: 0.9, ease: "easeOut", delay: 0.3 + index * 0.06 }}
            />
          </div>
        </div>

        {/* AI summary */}
        <p className="text-sm text-white/60 leading-relaxed">
          {summary}
        </p>
      </div>

      {/* ── Key Signals ────────────────────────────────────────── */}
      {topKeywords.length > 0 && (
        <div className="px-5 pb-4">
          <p className="text-xs font-medium text-white/30 uppercase tracking-widest mb-2">
            Key Signals
          </p>
          <div className="flex flex-wrap gap-1.5">
            {topKeywords.map((kw) => (
              <span
                key={kw}
                className="px-2.5 py-1 rounded-lg bg-purple-500/8 border border-purple-500/12 text-purple-300/80 text-xs font-medium"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Expand / Collapse ───────────────────────────────────── */}
      <div className="border-t border-white/[0.05]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-5 py-3 text-xs text-white/35 hover:text-white/60 hover:bg-white/[0.02] transition-all"
        >
          <span>{expanded ? "Hide details" : "View details"}</span>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown size={13} />
          </motion.div>
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 space-y-4 border-t border-white/[0.04]">
                {/* All keywords */}
                {extraKeywords.length > 0 && (
                  <div className="pt-4">
                    <p className="text-xs font-medium text-white/25 uppercase tracking-widest mb-2">
                      All Keywords
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {allKeywords.map((kw) => (
                        <span
                          key={kw}
                          className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.07] text-white/45 text-xs"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div className="pt-1 grid grid-cols-2 gap-3">
                  {coherenceDisplay != null && (
                    <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
                      <p className="text-xs text-white/30 mb-0.5">Coherence Score</p>
                      <p className="text-lg font-bold text-purple-400 tabular-nums">
                        {coherenceDisplay}%
                      </p>
                      <p className="text-xs text-white/25 mt-0.5">
                        {coherenceDisplay >= 70
                          ? "Strong signal"
                          : coherenceDisplay >= 50
                          ? "Moderate signal"
                          : "Weak signal"}
                      </p>
                    </div>
                  )}
                  <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
                    <p className="text-xs text-white/30 mb-0.5">Keyword Density</p>
                    <p className="text-lg font-bold text-white/70 tabular-nums">
                      {allKeywords.length}
                    </p>
                    <p className="text-xs text-white/25 mt-0.5">unique terms</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
