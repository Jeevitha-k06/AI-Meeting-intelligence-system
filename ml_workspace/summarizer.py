"""
Hierarchical meeting summarizer — SyncSpace AI.

Pipeline (no LLM APIs; local NLP only)
--------------------------------------
1. Tokenize & clean transcript sentences
2. classify_sentence() — assign hierarchical labels (DECISION, ACTION, …)
3. encode + deduplicate_sentences() — semantic dedup @ 0.82
4. score_sentence() — weighted importance by category
5. Section builders:
     generate_executive_summary()  — abstractive synthesis paragraph
     extract_decisions()
     extract_deadlines()         — owner + task + date
     extract_ownership()
     extract_risks()
     extract_architecture_changes()
6. Return structured meeting minutes JSON

Previous approach failed because it ranked sentences by embedding similarity alone,
so deadlines, recaps, and filler scored as “central” and were pasted verbatim.
This design classifies first, then synthesizes sections from typed facts.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Sequence, Set, Tuple

import nltk
import numpy as np
import spacy
from nltk.tokenize import sent_tokenize
from sklearn.metrics.pairwise import cosine_similarity

from embedding_manager import encode as encode_sentences

nltk.download("punkt", quiet=True)
nltk.download("punkt_tab", quiet=True)

try:
    _NLP = spacy.load("en_core_web_sm")
except OSError:
    import spacy.cli
    spacy.cli.download("en_core_web_sm")
    _NLP = spacy.load("en_core_web_sm")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SEMANTIC_DEDUP_THRESHOLD: float = 0.82
MIN_SENTENCE_WORDS: int = 5
MAX_DECISIONS: int = 6
MAX_DEADLINES: int = 10
MAX_RISKS: int = 5
MAX_ARCHITECTURE_ITEMS: int = 5
DEADLINE_LOOKBACK: int = 4

# Category scoring weights (higher = more important for minutes)
CATEGORY_WEIGHTS: Dict[str, float] = {
    "DECISION": 3.0,
    "ARCHITECTURE": 2.5,
    "OWNERSHIP": 2.4,
    "ACTION": 2.2,
    "PROBLEM": 1.8,
    "RISK": 1.7,
    "CONTEXT": 1.2,
    "DEADLINE": 0.4,  # deadlines go to deadline section, not executive
    "RECAP": 0.1,
    "FILLER": 0.0,
}

NOT_PERSON_TERMS = {
    "docker", "schemas", "schema", "postgresql", "postgres", "kubernetes",
    "redis", "kafka", "elasticache", "eks", "ecs", "aws", "helm", "istio",
    "microservices", "monolith", "api", "json", "billing", "email", "finance",
}

DATE_PATTERN = re.compile(
    r"\b(?:january|february|march|april|may|june|july|august|september|"
    r"october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\b",
    re.IGNORECASE,
)

DATE_EXTRACT_PATTERNS: Tuple[re.Pattern, ...] = tuple(
    re.compile(p, re.I)
    for p in (
        r"(?:deadline(?:\s+is|\s+for)?|due(?:\s+by|\s+on)?|by)\s+"
        r"((?:january|february|march|april|may|june|july|august|september|"
        r"october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?)",
        r"(?:your|the)\s+deadline\s+is\s+"
        r"((?:january|february|march|april|may|june|july|august|september|"
        r"october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?)",
        r"(?:next\s+deadline\s+is\s+)"
        r"((?:january|february|march|april|may|june|july|august|september|"
        r"october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?)",
    )
)


class SentenceCategory(str, Enum):
    CONTEXT = "CONTEXT"
    PROBLEM = "PROBLEM"
    DECISION = "DECISION"
    ACTION = "ACTION"
    DEADLINE = "DEADLINE"
    RISK = "RISK"
    ARCHITECTURE = "ARCHITECTURE"
    OWNERSHIP = "OWNERSHIP"
    RECAP = "RECAP"
    FILLER = "FILLER"


@dataclass
class ClassifiedSentence:
    """One transcript sentence with type labels and importance score."""

    index: int
    text: str
    primary: SentenceCategory
    tags: Set[SentenceCategory] = field(default_factory=set)
    score: float = 0.0
    embedding_row: int = -1


@dataclass
class OwnershipRecord:
    owner: str
    responsibility: str
    deadline: str = ""


@dataclass
class DeadlineRecord:
    owner: str
    task: str
    date: str
    source_index: int


@dataclass
class MeetingSummary:
    executive_summary: str = ""
    key_decisions: List[str] = field(default_factory=list)
    action_items: List[str] = field(default_factory=list)
    critical_deadlines: List[str] = field(default_factory=list)
    major_risks: List[str] = field(default_factory=list)
    architecture_changes: List[str] = field(default_factory=list)
    assigned_ownership: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, object]:
        return {
            "executive_summary": self.executive_summary,
            "key_decisions": self.key_decisions,
            "action_items": self.action_items,
            "critical_deadlines": self.critical_deadlines,
            "major_risks": self.major_risks,
            "architecture_changes": self.architecture_changes,
            "assigned_ownership": self.assigned_ownership,
        }


# ---------------------------------------------------------------------------
# Cleaning & tokenization
# ---------------------------------------------------------------------------

FILLER_EXACT = {
    "absolutely", "understood", "got it", "i've got it", "makes sense",
    "yes", "no", "ok", "okay", "sure", "sounds good", "thanks", "thank you",
}

RECAP_MARKERS = (
    "just to recap", "recap our", "to recap", "finally,", "in summary",
    "this has been an incredibly productive", "solid foundation",
    "let's close out", "close out here",
)

FILLER_MARKERS = (
    "understood", "absolutely", "got it", "i've got it", "sounds good",
    "thank you", "thanks everyone", "yes,", "okay,", "ok,",
)


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def tokenize_sentences(transcript: str) -> List[str]:
    """Split transcript into sentences with basic whitespace normalization."""
    if not transcript or not transcript.strip():
        return []
    return [_normalize(s) for s in sent_tokenize(transcript.strip()) if _normalize(s)]


# ---------------------------------------------------------------------------
# classify_sentence()
# ---------------------------------------------------------------------------

def _matches_any(lower: str, phrases: Sequence[str]) -> bool:
    return any(p in lower for p in phrases)


def classify_sentence(text: str, doc=None) -> Tuple[SentenceCategory, Set[SentenceCategory]]:
    """
    Assign primary and secondary categories using rules + spaCy DATE/PERSON cues.

    Classification runs before ranking so deadlines and recaps never dominate
    the executive summary.
    """
    if doc is None:
        doc = _NLP(text)

    lower = text.lower()
    alpha = re.sub(r"[^a-z\s]", "", lower).strip()
    tags: Set[SentenceCategory] = set()

    if len(lower.split()) < 4 or alpha in FILLER_EXACT:
        return SentenceCategory.FILLER, {SentenceCategory.FILLER}

    if _matches_any(lower, FILLER_MARKERS) and len(lower.split()) < 12:
        return SentenceCategory.FILLER, {SentenceCategory.FILLER}

    if _matches_any(lower, RECAP_MARKERS):
        tags.add(SentenceCategory.RECAP)

    if DATE_PATTERN.search(text) or any(ent.label_ == "DATE" for ent in doc.ents):
        tags.add(SentenceCategory.DEADLINE)

    if _matches_any(
        lower,
        (
            "operational risk", "learning curve", "bottleneck", "too much risk",
            "severe ceiling", "timeouts", "lock contention", "overwhelm",
            "steep learning", "massive wall", "hovering in limbo",
        ),
    ):
        tags.add(SentenceCategory.RISK)

    if _matches_any(
        lower,
        (
            "primary issue", "problem is", "stress test", "contention",
            "skewed", "bottleneck", "ceiling", "spiked over",
        ),
    ):
        tags.add(SentenceCategory.PROBLEM)

    if _matches_any(
        lower,
        (
            "going with", "go with", "let's adopt", "adopt ", "decided",
            "make the call", "make a definitive decision", "we will stick with",
            "selected", "chosen", "standardize", "finalized",
        ),
    ):
        tags.add(SentenceCategory.DECISION)

    if _matches_any(
        lower,
        (
            "microservices", "monolith", "architecture", "read replica",
            "read-replica", "event-driven", "orchestration", "service mesh",
            "logical replication", "aurora", "elasticache", "msk", "helm",
        ),
    ):
        tags.add(SentenceCategory.ARCHITECTURE)

    if _matches_any(
        lower,
        (
            "need you to", "want you to", "your task", "explicit task",
            "assigning you", "take ownership", "officially the lead",
            "responsible for", "i need you", "you are officially",
            "want you to take ownership",
        ),
    ):
        tags.add(SentenceCategory.OWNERSHIP)
        tags.add(SentenceCategory.ACTION)

    if _matches_any(
        lower,
        (
            "goal for", "overarching goal", "primary overarching",
            "throughput", "latency", "rollout", "quarter is",
        ),
    ):
        tags.add(SentenceCategory.CONTEXT)

    # Primary = highest-priority tag by weight
    if SentenceCategory.FILLER in tags and len(tags) == 1:
        return SentenceCategory.FILLER, tags

    if SentenceCategory.RECAP in tags and SentenceCategory.DECISION not in tags:
        return SentenceCategory.RECAP, tags

    priority = [
        SentenceCategory.DECISION,
        SentenceCategory.OWNERSHIP,
        SentenceCategory.ACTION,
        SentenceCategory.ARCHITECTURE,
        SentenceCategory.RISK,
        SentenceCategory.PROBLEM,
        SentenceCategory.DEADLINE,
        SentenceCategory.CONTEXT,
        SentenceCategory.RECAP,
        SentenceCategory.FILLER,
    ]
    for cat in priority:
        if cat in tags:
            if not tags:
                tags.add(cat)
            return cat, tags

    return SentenceCategory.CONTEXT, {SentenceCategory.CONTEXT}


# ---------------------------------------------------------------------------
# Embeddings & deduplicate_sentences()
# ---------------------------------------------------------------------------

def deduplicate_sentences(
    items: List[ClassifiedSentence],
    embeddings: np.ndarray,
    threshold: float = SEMANTIC_DEDUP_THRESHOLD,
) -> List[ClassifiedSentence]:
    """
    Remove near-duplicate content; prefer non-RECAP sentences when similar.

    Recap lines often repeat earlier facts — keep the earlier, higher-signal line.
    """
    if not items:
        return []

    kept: List[ClassifiedSentence] = []
    kept_rows: List[int] = []

    # Process in transcript order so recaps lose to earlier sentences
    sorted_items = sorted(items, key=lambda x: x.index)

    for item in sorted_items:
        if item.primary in (SentenceCategory.FILLER, SentenceCategory.RECAP):
            continue
        row = item.embedding_row
        if row < 0:
            continue

        duplicate = False
        vec = embeddings[row].reshape(1, -1)
        for kr in kept_rows:
            sim = float(cosine_similarity(vec, embeddings[kr].reshape(1, -1))[0, 0])
            if sim >= threshold:
                duplicate = True
                break
        if not duplicate:
            kept.append(item)
            kept_rows.append(row)

    return kept


# ---------------------------------------------------------------------------
# score_sentence()
# ---------------------------------------------------------------------------

def score_sentence(item: ClassifiedSentence) -> float:
    """Weighted score — decisions and architecture rank above deadlines/filler."""
    base = CATEGORY_WEIGHTS.get(item.primary.value, 1.0)
    bonus = 0.0
    for tag in item.tags:
        bonus = max(bonus, CATEGORY_WEIGHTS.get(tag.value, 0.0) * 0.15)
    length_factor = min(1.2, len(item.text.split()) / 20.0)
    return (base + bonus) * length_factor


def build_classified_corpus(transcript: str) -> Tuple[List[ClassifiedSentence], np.ndarray]:
    """Tokenize, classify, embed, score all sentences."""
    raw = tokenize_sentences(transcript)
    if not raw:
        return [], np.array([])

    classified: List[ClassifiedSentence] = []
    embeddable: List[str] = []

    for idx, text in enumerate(raw):
        if len(text.split()) < MIN_SENTENCE_WORDS:
            doc = _NLP(text)
            primary, tags = classify_sentence(text, doc)
            if primary == SentenceCategory.FILLER:
                continue
        else:
            doc = _NLP(text)
            primary, tags = classify_sentence(text, doc)

        if primary == SentenceCategory.FILLER:
            continue

        item = ClassifiedSentence(
            index=idx,
            text=text,
            primary=primary,
            tags=tags or {primary},
        )
        classified.append(item)
        embeddable.append(text)

    if not embeddable:
        return [], np.array([])

    embeddings = encode_sentences(embeddable)
    for i, item in enumerate(classified):
        item.embedding_row = i
        item.score = score_sentence(item)

    return classified, embeddings


# ---------------------------------------------------------------------------
# Person / date helpers
# ---------------------------------------------------------------------------

def _is_valid_person(name: str) -> bool:
    if not name:
        return False
    if name.lower() in NOT_PERSON_TERMS:
        return False
    return bool(re.fullmatch(r"[A-Z][a-z]{1,14}", name.strip()))


def _extract_person_from_sentence(text: str, doc) -> str:
    for ent in doc.ents:
        if ent.label_ == "PERSON" and _is_valid_person(ent.text):
            return ent.text.strip()
    m = re.match(r"^([A-Z][a-z]+)[,:]", text)
    if m and _is_valid_person(m.group(1)):
        return m.group(1).strip()
    m = re.search(r"(?:assigned\s+to|need|want)\s+([A-Z][a-z]+)\s+to\b", text, re.I)
    if m and _is_valid_person(m.group(1)):
        return m.group(1).strip()
    return ""


def _extract_dates(text: str) -> List[str]:
    found: List[str] = []
    for pat in DATE_EXTRACT_PATTERNS:
        for m in pat.finditer(text):
            d = m.group(1).strip()
            if d and d not in found:
                found.append(d)
    return found


def _short_task(text: str, owner: str, dates: List[str]) -> str:
    t = text
    if owner:
        t = re.sub(rf"^{re.escape(owner)}[,:]?\s*", "", t, flags=re.I)
    for d in dates:
        t = t.replace(d, "")
    t = re.sub(
        r"(?:your|the)\s+(?:explicit\s+)?task\s+is\s+to\s+",
        "",
        t,
        flags=re.I,
    )
    t = re.sub(r"(?:i|we)\s+(?:need|want)\s+you\s+to\s+", "", t, flags=re.I)
    t = re.sub(r"(?:deadline|due).*", "", t, flags=re.I)
    t = _normalize(t).strip(" .,;")
    if len(t.split()) > 14:
        t = t.split(",")[0]
    return t


# ---------------------------------------------------------------------------
# Section extractors
# ---------------------------------------------------------------------------

def _synthesize_decision_bullet(text: str) -> str:
    """Convert raw decision sentences into concise bullets (dynamic cleanup only)."""
    if not text:
        return ""
    if not isinstance(text, str):
        text = str(text)
    t = text.strip()
    if not t:
        return ""
    t = re.sub(r"^let(?:'s| us)\s+", "", t, flags=re.I)
    t = re.sub(r"^we are\s+", "We ", t, flags=re.I)
    t = re.sub(r"^we're\s+", "We ", t, flags=re.I)
    t = re.sub(r"^we will\s+", "We will ", t, flags=re.I)
    t = t.replace("going with", "selected")
    t = t.replace("go with", "selected")
    t = t.replace("stick with", "retain")
    if re.match(r"^adopt\b", t, re.I):
        t = re.sub(r"^adopt\b", "Adopted", t, count=1, flags=re.I)
    t = t.strip()
    if not t:
        return ""
    t = t[:1].upper() + t[1:] if len(t) > 1 else t.upper()
    return t.rstrip(" .")


def _sentence_text(item: object) -> str:
    """Normalize ClassifiedSentence (or malformed entry) to plain text."""
    if isinstance(item, ClassifiedSentence):
        return item.text or ""
    if isinstance(item, dict):
        return str(item.get("text", ""))
    if isinstance(item, str):
        return item
    return str(getattr(item, "text", ""))


def _merge_decision_lists(primary: Sequence[str], secondary: Sequence[str]) -> List[str]:
    """Merge semantic detector output with classified sentences; dedupe."""
    seen: Set[str] = set()
    merged: List[str] = []
    for line in list(primary) + list(secondary):
        key = line.lower().strip()[:80]
        if key and key not in seen:
            seen.add(key)
            merged.append(line.rstrip("."))
    return merged[:MAX_DECISIONS]


def extract_decisions(items: Sequence[ClassifiedSentence]) -> List[str]:
    """Only true DECISION-tagged sentences; exclude recap duplicates."""
    lines: List[str] = []
    seen: Set[str] = set()
    candidates = sorted(
        [
            i for i in items
            if isinstance(i, ClassifiedSentence)
            and (SentenceCategory.DECISION in i.tags or i.primary == SentenceCategory.DECISION)
        ],
        key=lambda x: -x.score,
    )
    for item in candidates:
        if item.primary == SentenceCategory.RECAP:
            continue

        raw_text = _sentence_text(item)
        if not raw_text.strip():
            continue

        try:
            line = _synthesize_decision_bullet(raw_text)
        except Exception:
            # Defensive: never crash the pipeline on one bad sentence
            line = raw_text.strip().rstrip(".")

        if not line or len(line.split()) < 3:
            continue

        key = line.lower()
        if key not in seen:
            seen.add(key)
            lines.append(line)
        if len(lines) >= MAX_DECISIONS:
            break
    return lines


def extract_risks(items: Sequence[ClassifiedSentence]) -> List[str]:
    lines: List[str] = []
    seen: Set[str] = set()
    for item in sorted(items, key=lambda x: -x.score):
        if SentenceCategory.RISK not in item.tags and item.primary != SentenceCategory.RISK:
            continue
        line = item.text
        if len(line.split()) > 25:
            line = line.split(".")[0] + "."
        key = line.lower()[:60]
        if key not in seen:
            seen.add(key)
            lines.append(line)
        if len(lines) >= MAX_RISKS:
            break
    return lines


def extract_architecture_changes(items: Sequence[ClassifiedSentence]) -> List[str]:
    lines: List[str] = []
    seen: Set[str] = set()
    for item in sorted(items, key=lambda x: -x.score):
        if SentenceCategory.ARCHITECTURE not in item.tags:
            continue
        if item.primary in (SentenceCategory.FILLER, SentenceCategory.RECAP, SentenceCategory.DEADLINE):
            continue
        key = item.text.lower()[:70]
        if key not in seen:
            seen.add(key)
            lines.append(item.text)
        if len(lines) >= MAX_ARCHITECTURE_ITEMS:
            break
    return lines


def extract_ownership(
    sentences: Sequence[str],
    items: Sequence[ClassifiedSentence],
) -> List[OwnershipRecord]:
    """Map owners to responsibilities using OWNERSHIP/ACTION sentences."""
    records: List[OwnershipRecord] = []
    current_owner = ""

    for idx, text in enumerate(sentences):
        doc = _NLP(text)
        person = _extract_person_from_sentence(text, doc)
        if person:
            current_owner = person

        item = next((i for i in items if i.index == idx), None)
        if item is None:
            continue
        if item.primary not in (
            SentenceCategory.OWNERSHIP,
            SentenceCategory.ACTION,
        ) and SentenceCategory.OWNERSHIP not in item.tags:
            continue

        owner = person or current_owner
        if not _is_valid_person(owner):
            continue

        task = _short_task(text, owner, _extract_dates(text))
        if len(task.split()) < 3:
            continue

        deadline = "; ".join(_extract_dates(text)) or ""
        records.append(OwnershipRecord(owner=owner, responsibility=task, deadline=deadline))

    # Deduplicate by owner+task prefix
    unique: List[OwnershipRecord] = []
    seen: Set[str] = set()
    for rec in records:
        key = f"{rec.owner}|{rec.responsibility.lower()[:50]}"
        if key not in seen:
            seen.add(key)
            unique.append(rec)
    return unique


def extract_deadlines(
    sentences: Sequence[str],
    items: Sequence[ClassifiedSentence],
) -> List[str]:
    """
    Owner — task — date lines using nearest prior OWNERSHIP/ACTION anchor.

    Skips roadmap dates (beta/GA) and recap sentences.
    """
    index_to_item = {i.index: i for i in items}
    anchors: List[Tuple[int, str, str]] = []  # (index, owner, task)

    for item in items:
        if item.primary in (SentenceCategory.OWNERSHIP, SentenceCategory.ACTION):
            doc = _NLP(item.text)
            owner = _extract_person_from_sentence(item.text, doc)
            if _is_valid_person(owner):
                task = _short_task(item.text, owner, _extract_dates(item.text))
                if len(task.split()) >= 3:
                    anchors.append((item.index, owner, task))

    formatted: List[str] = []
    seen: Set[str] = set()

    for idx, sentence in enumerate(sentences):
        item = index_to_item.get(idx)
        if item and item.primary == SentenceCategory.RECAP:
            continue
        if _matches_any(sentence.lower(), RECAP_MARKERS):
            continue
        if _matches_any(
            sentence.lower(),
            ("beta release", "general availability", "holiday traffic", "overarching goal"),
        ) and not _matches_any(sentence.lower(), ("your deadline", "deadline for", "need you to")):
            continue

        dates = _extract_dates(sentence)
        if not dates:
            continue

        # Find nearest anchor before this sentence
        best: Optional[Tuple[int, str, str]] = None
        best_dist = DEADLINE_LOOKBACK + 1
        for a_idx, owner, task in anchors:
            dist = idx - a_idx
            if 0 < dist <= DEADLINE_LOOKBACK and dist < best_dist:
                best_dist = dist
                best = (a_idx, owner, task)

        if not best:
            continue

        _, owner, task = best

        # Split dual-deadline assignment clauses (e.g. June 15th … June 22nd).
        if len(dates) >= 2 and "following that" in sentence.lower():
            clauses = re.split(r",?\s*following that,?\s*", sentence, flags=re.I)
            for clause, date in zip(clauses, dates):
                clause_dates = _extract_dates(clause)
                use_date = clause_dates[0] if clause_dates else date
                sub_task = _short_task(clause, owner, [use_date])
                if len(sub_task.split()) < 3:
                    sub_task = task
                line = f"{owner} — {sub_task} — {use_date}"
                if line.lower() not in seen:
                    seen.add(line.lower())
                    formatted.append(line)
            continue

        for date in dates:
            line = f"{owner} — {task} — {date}"
            if line.lower() not in seen:
                seen.add(line.lower())
                formatted.append(line)

    return formatted[:MAX_DEADLINES]


def format_ownership_summary(records: Sequence[OwnershipRecord]) -> List[str]:
    lines: List[str] = []
    for rec in records:
        if rec.deadline:
            lines.append(f"{rec.owner} — {rec.responsibility} — {rec.deadline}")
        else:
            lines.append(f"{rec.owner} — {rec.responsibility}")
    return lines


# ---------------------------------------------------------------------------
# generate_executive_summary() — abstractive synthesis
# ---------------------------------------------------------------------------

def _detect_themes(items: Sequence[ClassifiedSentence]) -> Dict[str, bool]:
    """Boolean flags for major meeting themes from classified content."""
    themes = {
        "microservices": False,
        "postgres_replication": False,
        "redis_cache": False,
        "eks": False,
        "kafka_msk": False,
        "scaling": False,
    }
    for item in items:
        lower = item.text.lower()
        if "microservices" in lower or "monolith" in lower:
            themes["microservices"] = True
        if "read replica" in lower or "logical replication" in lower or (
            "postgresql" in lower and "replicat" in lower
        ):
            themes["postgres_replication"] = True
        if "redis" in lower or "elasticache" in lower or "caching" in lower:
            themes["redis_cache"] = True
        if "eks" in lower or ("kubernetes" in lower and "going with" in lower):
            themes["eks"] = True
        if "kafka" in lower or "msk" in lower:
            themes["kafka_msk"] = True
        if "throughput" in lower or "latency" in lower or "scaling" in lower:
            themes["scaling"] = True
    return themes


def _theme_phrases(themes: Dict[str, bool]) -> List[str]:
    """Build dynamic theme phrases from detected flags."""
    phrases: List[str] = []
    if themes["microservices"]:
        phrases.append("microservices architecture and service decomposition")
    if themes["postgres_replication"]:
        phrases.append("database replication and PostgreSQL scaling")
    if themes["redis_cache"]:
        phrases.append("caching and in-memory data layers")
    if themes["eks"]:
        phrases.append("Kubernetes orchestration and EKS migration")
    if themes["kafka_msk"]:
        phrases.append("event-driven messaging with Kafka")
    if themes["scaling"]:
        phrases.append("throughput, latency, and capacity planning")
    return phrases


def generate_executive_summary(
    items: Sequence[ClassifiedSentence],
    decisions: Sequence[str],
    ownership: Sequence[OwnershipRecord],
    risks: Sequence[str],
) -> str:
    """
    Build a concise executive paragraph from extracted facts (no hardcoded outcomes).
    """
    themes = _detect_themes(items)
    theme_list = _theme_phrases(themes)
    parts: List[str] = []

    if theme_list:
        if len(theme_list) == 1:
            focus = theme_list[0]
        else:
            focus = ", ".join(theme_list[:-1]) + f", and {theme_list[-1]}"
        parts.append(f"This meeting addressed {focus}.")
    else:
        parts.append(
            "This meeting covered technical planning, implementation priorities, "
            "and operational next steps."
        )

    if decisions:
        lead = decisions[0].rstrip(".")
        if len(decisions) > 1:
            parts.append(
                f"Key outcomes include {lead}, among {len(decisions)} recorded decisions."
            )
        else:
            parts.append(f"A primary decision: {lead}.")

    if risks:
        parts.append(
            f"Risks and concerns were raised ({len(risks)} item(s) flagged)."
        )

    if ownership:
        owners = sorted({r.owner for r in ownership if _is_valid_person(r.owner)})
        if owners:
            if len(owners) == 1:
                parts.append(f"Action ownership was assigned to {owners[0]}.")
            else:
                parts.append(
                    "Ownership was distributed across "
                    + ", ".join(owners[:-1])
                    + f", and {owners[-1]}."
                )

    text = " ".join(parts)
    return _polish_executive_summary(text)


def _polish_executive_summary(text: str) -> str:
    """Light editorial pass — executive tone without losing technical detail."""
    if not text:
        return text
    t = text.strip()
    replacements = (
        ("This meeting addressed", "The team focused on"),
        ("A primary decision:", "A key decision was"),
        ("Key outcomes include", "Notable outcomes include"),
        ("among", "including"),
        ("Risks and concerns were raised", "Technical risks discussed included"),
        ("Action ownership was assigned to", "Ownership was assigned to"),
        ("Ownership was distributed across", "Responsibilities were assigned to"),
    )
    for old, new in replacements:
        t = t.replace(old, new)
    t = re.sub(r"\s+", " ", t)
    if not t.endswith("."):
        t += "."
    return t


def format_action_items_summary(action_dicts: Sequence[dict]) -> List[str]:
    """Format action extractor output as summary bullets."""
    lines: List[str] = []
    seen: Set[str] = set()
    for item in action_dicts:
        assignee = item.get("assigned_to") or item.get("assignee") or "Unassigned"
        tasks = item.get("tasks") or []
        if not tasks and item.get("task"):
            tasks = [item["task"]]
        deadline = item.get("deadline", "Not specified")
        for task in tasks:
            line = f"{assignee}: {task}"
            if deadline and deadline != "Not specified":
                line += f" (by {deadline})"
            key = line.lower()
            if key not in seen:
                seen.add(key)
                lines.append(line)
    return lines[:10]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_summary(
    transcript: str,
    num_sentences: int = 4,
    action_items: Optional[Sequence[dict]] = None,
) -> Dict[str, object]:
    """
    Hierarchical meeting minutes generator (extractive; no LLM APIs).

    Args:
        transcript: Raw meeting text.
        num_sentences: Caps architecture/risk list density.
        action_items: Optional pre-extracted tasks from action_extractor.

    Returns:
        dict with executive_summary, key_decisions, action_items,
        critical_deadlines, major_risks, architecture_changes, assigned_ownership.
    """
    empty: Dict[str, object] = {
        "executive_summary": "",
        "key_decisions": [],
        "action_items": [],
        "critical_deadlines": [],
        "major_risks": [],
        "architecture_changes": [],
        "assigned_ownership": [],
    }

    sentences = tokenize_sentences(transcript)
    if not sentences:
        return empty

    classified, embeddings = build_classified_corpus(transcript)
    if not classified:
        return empty

    deduped = deduplicate_sentences(classified, embeddings)

    from decision_detector import detect_decisions as detect_semantic_decisions

    classified_decisions = extract_decisions(deduped)
    semantic_decisions = [
        d["decision"].rstrip(".")
        for d in detect_semantic_decisions(transcript)
    ]
    decisions = _merge_decision_lists(semantic_decisions, classified_decisions)
    ownership_records = extract_ownership(sentences, deduped)
    deadlines = extract_deadlines(sentences, deduped)
    risks = extract_risks(deduped)
    architecture = extract_architecture_changes(deduped)

    if action_items is None:
        from action_extractor import extract_tasks
        action_items = extract_tasks(transcript)

    action_lines = format_action_items_summary(action_items or [])
    executive = generate_executive_summary(
        deduped, decisions, ownership_records, risks
    )
    ownership_lines = format_ownership_summary(ownership_records)

    return MeetingSummary(
        executive_summary=executive,
        key_decisions=decisions,
        action_items=action_lines,
        critical_deadlines=deadlines,
        major_risks=risks,
        architecture_changes=architecture[: max(3, num_sentences)],
        assigned_ownership=ownership_lines,
    ).to_dict()
