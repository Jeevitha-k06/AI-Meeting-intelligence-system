"""
Strict decision detection — commitment language required; semantic similarity is auxiliary only.
"""

from __future__ import annotations

import re
from typing import List, Optional, Tuple

import nltk
import spacy
from nltk.tokenize import sent_tokenize

nltk.download("punkt", quiet=True)
nltk.download("punkt_tab", quiet=True)

try:
    _NLP = spacy.load("en_core_web_sm")
except OSError:
    import spacy.cli
    spacy.cli.download("en_core_web_sm")
    _NLP = spacy.load("en_core_web_sm")

MIN_CONFIDENCE = 0.72
# Semantic similarity may only boost confidence when commitment language is already present
SEMANTIC_BOOST_THRESHOLD = 0.58

DECISION_VERBS = (
    "decide", "decided", "choose", "chosen", "select", "selected",
    "adopt", "adopted", "approve", "approved", "finalize", "finalized",
    "agree", "agreed", "commit", "committed", "retain", "retained",
    "standardize", "standardized", "settle", "settled", "rule", "ruled",
)

DECISION_PHRASES = (
    "go with",
    "going with",
    "move forward with",
    "standardize on",
    "stick with",
    "sticking with",
    "clear winner",
    "final decision",
    "let's adopt",
    "let us adopt",
    "commit to",
    "settle on",
    "ruled out",
    "will use",
    "we'll use",
    "will retain",
    "will deploy",
    "will stick",
)

FUTURE_COMMITMENT_RE = re.compile(
    r"\b(?:we(?:'ll| will)|let(?:'s| us)|going to|are going to)\s+"
    r"(?:use|adopt|deploy|retain|stick|go with|standardize|migrate|implement)\b",
    re.I,
)

STRONG_COMMITMENT_PATTERNS = [
    (r"\bwe(?:'re| are)\s+going\s+with\b", "going with"),
    (r"\bwe(?:'ll| will)\s+use\b", "will use"),
    (r"\bwe(?:'ll| will)\s+retain\b", "will retain"),
    (r"\bwe(?:'ll| will)\s+stick\s+with\b", "will stick with"),
    (r"\bwe(?:'re| are)\s+sticking\s+with\b", "sticking with"),
    (r"\bwe\s+decided\s+to\b", "decided to"),
    (r"\bwe\s+decided\b", "decided"),
    (r"\bwe\s+selected\b", "selected"),
    (r"\bfinal\s+decision\b", "final decision"),
    (r"\blet(?:'s| us)\s+adopt\b", "let's adopt"),
    (r"\blet(?:'s| us)\s+go\s+with\b", "let's go with"),
    (r"\bwe(?:'re| are)\s+adopting\b", "adopting"),
    (r"\bcommit(?:ted|ting)?\s+to\b", "commit to"),
    (r"\bsettle(?:d|s)?\s+on\b", "settle on"),
    (r"\b(?:is|are)\s+the\s+clear\s+winner\b", "clear winner"),
    (r"\bruled\s+out\b", "ruled out"),
    (r"\bstandardiz(?:e|ed|ing)\s+on\b", "standardize on"),
]

REJECT_PATTERNS = [
    r"\bthanks?\s+for\s+taking\b",
    r"\bthanks?\s+for\b",
    r"\bthank\s+you\b",
    r"\bgood\s+morning\b",
    r"\bgood\s+afternoon\b",
    r"\bwelcome\s+everyone\b",
    r"\blooking\s+at\s+the\s+logs\b",
    r"\bindustry\s+standard\b",
    r"\bi\s+will\s+draft\b",
    r"\bi'll\s+draft\b",
    r"\bmake\s+the\s+call\b",
    r"\bhovering\s+in\s+limbo\b",
    r"\bwe\s+should\s+consider\b",
    r"\bneed\s+to\s+discuss\b",
    r"\bstill\s+evaluating\b",
    r"\bfor\s+example\b",
    r"\bthe\s+problem\s+is\b",
    r"\bthe\s+issue\s+is\b",
]

OBSERVATION_PATTERNS = [
    r"\bis\s+the\s+industry\b",
    r"\btypically\s+",
    r"\busually\s+",
    r"\bin\s+general\b",
    r"\bfrom\s+what\s+i\s+see\b",
    r"\blooking\s+at\b",
    r"\bas\s+you\s+can\s+see\b",
]

TASK_PATTERNS = [
    r"\bneed\s+you\s+to\b",
    r"\bwant\s+you\s+to\b",
    r"\byour\s+task\b",
    r"\bassigning\s+you\b",
    r"\btake\s+ownership\b",
    r"\bi\s+will\s+(?:draft|write|prepare|create|build)\b",
    r"\bi'll\s+(?:draft|write|prepare)\b",
]

HYPOTHETICAL_PATTERNS = [
    r"\bif\s+we\b", r"\bif\s+you\b", r"\bwhat\s+if\b",
    r"\bwould\s+we\b", r"\bcould\s+we\b", r"\bmight\s+we\b",
]

_PROTO_EMBEDDINGS = None

CATEGORIES = {
    "DATABASE": [
        "postgresql", "postgres", "mysql", "mongodb", "redis", "database", "sql",
        "aurora", "rds", "schema", "replication", "pgbouncer", "read replica",
    ],
    "INFRASTRUCTURE": [
        "aws", "gcp", "azure", "cloud", "infrastructure", "kubernetes", "k8s",
        "docker", "vpc", "ecs", "eks", "ec2", "terraform", "helm",
    ],
    "SECURITY": [
        "auth", "security", "oauth", "jwt", "encryption", "firewall", "iam", "mtls", "istio",
    ],
    "DEPLOYMENT": ["ci/cd", "pipeline", "jenkins", "gitlab", "deploy", "rollout", "release"],
    "MESSAGING": ["kafka", "rabbitmq", "sqs", "sns", "messaging", "event bus", "msk"],
    "ARCHITECTURE": [
        "microservices", "monolith", "serverless", "architecture", "api", "grpc",
        "service mesh", "event-driven",
    ],
}


def _has_commitment_language(sentence_lower: str) -> Tuple[bool, Optional[str]]:
    """Require explicit decision verb/phrase or future commitment + tech context."""
    for pattern, label in STRONG_COMMITMENT_PATTERNS:
        if re.search(pattern, sentence_lower):
            return True, label

    for phrase in DECISION_PHRASES:
        if phrase in sentence_lower:
            return True, phrase

    for verb in DECISION_VERBS:
        if re.search(rf"\b{re.escape(verb)}\b", sentence_lower):
            return True, verb

    if FUTURE_COMMITMENT_RE.search(sentence_lower):
        return True, "future commitment"

    return False, None


def _grammar_has_commitment_root(sentence: str) -> bool:
    """spaCy: ROOT or xcomp must be commitment-related verb."""
    doc = _NLP(sentence[:1500])
    for token in doc:
        if token.dep_ != "ROOT" and token.dep_ != "xcomp":
            continue
        if token.pos_ != "VERB":
            continue
        lemma = token.lemma_.lower()
        text = token.text.lower()
        if lemma in DECISION_VERBS or text in DECISION_VERBS:
            return True
        span = sentence[max(0, token.idx - 20): token.idx + len(token.text) + 30].lower()
        if any(p in span for p in DECISION_PHRASES):
            return True
    return False


def _is_rejected(sentence_lower: str) -> bool:
    if any(re.search(p, sentence_lower) for p in REJECT_PATTERNS):
        return True
    if any(re.search(p, sentence_lower) for p in HYPOTHETICAL_PATTERNS):
        return True
    if any(re.search(p, sentence_lower) for p in TASK_PATTERNS):
        return True
    if any(re.search(p, sentence_lower) for p in OBSERVATION_PATTERNS):
        return True
    weak = ("might", "could", "should", "perhaps", "maybe", "probably", "i think")
    if sum(1 for w in weak if w in sentence_lower) >= 2:
        return True
    return False


def _categorize_decision(sentence_lower: str) -> str:
    best, max_m = "GENERAL", 0
    for category, keywords in CATEGORIES.items():
        m = sum(1 for kw in keywords if re.search(rf"\b{re.escape(kw)}\b", sentence_lower))
        if m > max_m:
            max_m, best = m, category
    return best


_PROTO_EMBEDDINGS = None
_PROTO_TEXTS = (
    "We decided to adopt this technology.",
    "We are going with this platform.",
    "We will retain PostgreSQL and use read replicas.",
    "Let's adopt Kafka for messaging.",
)


def _semantic_boost(sentence: str) -> float:
    """Optional boost only — never used alone for acceptance."""
    global _PROTO_EMBEDDINGS
    try:
        from embedding_manager import encode
        from sklearn.metrics.pairwise import cosine_similarity

        if _PROTO_EMBEDDINGS is None:
            _PROTO_EMBEDDINGS = encode(_PROTO_TEXTS)
        vec = encode([sentence])
        return float(cosine_similarity(vec, _PROTO_EMBEDDINGS).max())
    except Exception:
        return 0.0


def _calculate_confidence(
    sentence_lower: str,
    matched: str,
    category: str,
    has_grammar: bool,
    semantic_boost: float,
) -> float:
    confidence = 0.55
    if matched:
        confidence += 0.2
    if has_grammar:
        confidence += 0.1
    if category != "GENERAL":
        confidence += 0.12
    if semantic_boost >= SEMANTIC_BOOST_THRESHOLD:
        confidence += 0.08
    if any(w in sentence_lower for w in ("concern", "risk", "worry", "downside")):
        confidence -= 0.25
    return min(round(max(confidence, 0.0), 2), 1.0)


def _synthesize_decision_line(sentence: str) -> str:
    t = re.sub(r"\s+", " ", sentence).strip()
    if len(t) > 140:
        t = t.split(".")[0]
    t = t.rstrip(" .")
    return t[0].upper() + t[1:] if t else t


def _is_duplicate(new: str, seen: List[str], threshold: float = 0.72) -> bool:
    new_t = set(re.findall(r"[a-z0-9]+", new.lower()))
    if not new_t:
        return True
    for prev in seen:
        prev_t = set(re.findall(r"[a-z0-9]+", prev.lower()))
        if prev_t and len(new_t & prev_t) / len(new_t | prev_t) >= threshold:
            return True
    return False


def detect_decisions(transcript: str) -> list:
    if not transcript or not transcript.strip():
        return []

    decisions = []
    seen: List[str] = []

    for sentence in sent_tokenize(transcript.strip()):
        sl = sentence.lower()
        if len(sl.split()) < 5:
            continue
        if _is_rejected(sl):
            continue

        has_commit, matched = _has_commitment_language(sl)
        if not has_commit:
            continue

        if not _grammar_has_commitment_root(sentence):
            if not any(re.search(p, sl) for p, _ in STRONG_COMMITMENT_PATTERNS):
                if not FUTURE_COMMITMENT_RE.search(sl):
                    continue

        category = _categorize_decision(sl)
        sem = _semantic_boost(sentence)
        confidence = _calculate_confidence(
            sl, matched or "", category,
            has_grammar=True,
            semantic_boost=sem,
        )
        if confidence < MIN_CONFIDENCE:
            continue

        line = _synthesize_decision_line(sentence) + "."
        if _is_duplicate(line, seen):
            continue

        seen.append(line)
        decisions.append({
            "decision": line,
            "category": category,
            "keyword": matched,
            "confidence": confidence,
        })

    decisions.sort(key=lambda x: x["confidence"], reverse=True)
    return decisions[:10]
