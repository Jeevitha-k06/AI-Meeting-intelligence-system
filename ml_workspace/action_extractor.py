"""
Action-item extraction for technical meeting transcripts.

Pipeline
--------
1. Detect assignment anchors (regex + vocative patterns)
2. Collect sentence window around each anchor
3. Extract tasks via explicit clause regex + spaCy dependency reconstruction
4. Semantic cleanup and fragment rejection
5. Attach deadlines; deduplicate; score confidence
""" 

from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Dict, List, Optional, Sequence, Set, Tuple

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

CONTEXT_WINDOW_AFTER = 3
MIN_ACTION_CONFIDENCE = 0.45
MIN_TASK_WORDS = 4
MAX_TASK_WORDS = 18
MAX_IDEAL_TASK_WORDS = 14
TASK_SIMILARITY_THRESHOLD = 0.86

INCOMPLETE_FRAGMENT_MARKERS = (
    "the hardest part",
    "the problem is",
    "the issue is",
    "which means",
    "in other words",
    "for example",
    "such as",
)

# Truncate explanatory trailing clauses (not executable tasks)
EXPLANATION_CLAUSE_RE = re.compile(
    r"\s+(?:so|because|since|otherwise|in order to|that way|which means|"
    r"so that|as a result)\b.*$",
    re.I,
)

NON_ACTION_VERBS = {
    "know", "understand", "remember", "think", "believe", "feel", "see",
    "hear", "wonder", "hope", "wish", "agree", "disagree", "mean",
}

OWNERSHIP_ONLY = re.compile(
    r"^own\s+(?:this\s+)?(.+)$",
    re.I,
)

TASK_JUNK_PREFIXES: Tuple[re.Pattern, ...] = tuple(
    re.compile(p, re.I)
    for p in (
        r"^is\s+",
        r"^are\s+",
        r"^your\s+(?:explicit\s+)?task\s+is\s+to\s+",
        r"^explicit\s+task\s+is\s+to\s+",
        r"^task\s+is\s+to\s+",
        r"^(?:i|we)\s+(?:need|want)\s+you\s+to\s+",
        r"^assigned\s+to\s+",
        r"^take\s+ownership\s+of\s+",
        r"^ownership\s+of\s+",
        r"^to\s+",
        r"^and\s+",
    )
)

ACTION_VERBS = {
    "configure", "set", "setup", "provision", "deploy", "migrate", "architect",
    "document", "deliver", "own", "lead", "route", "transition", "write", "design",
    "build", "implement", "create", "define", "establish", "take", "spin", "test",
    "review", "update", "finalize", "prepare", "integrate", "refactor", "monitor",
    "establish", "ensure", "complete", "develop", "manage", "coordinate",
}

NOT_PERSON_TERMS = {
    "docker", "schemas", "schema", "postgresql", "postgres", "kubernetes",
    "redis", "kafka", "elasticache", "eks", "ecs", "aws", "helm", "istio",
    "microservices", "monolith", "api", "json", "billing", "email", "team",
    "everyone", "folks", "guys",
}

FRAGMENT_STARTERS = re.compile(
    r"^(?:with|in|on|at|by|for|from|to|your|my|our|the|a|an|"
    r"next|following|also|and|or|that|this|those|these|it|its)\b",
    re.I,
)

INCOMPLETE_ENDINGS = re.compile(
    r"\b(?:with|in|on|at|by|for|from|to|your|my|our|the|a|an|next|following)\s*$",
    re.I,
)

DISCUSSION_MARKERS = (
    "i think", "in my opinion", "maybe we should", "we could", "probably",
    "the problem is", "steep learning", "massive wall", "won't deny",
    "hovering in limbo", "i strongly advocate",
)

RECAP_MARKERS = (
    "just to recap", "recap our", "productive first session", "solid foundation",
    "close out here", "this has been an",
)

STRATEGIC_DATE_MARKERS = (
    "beta release", "general availability", "holiday traffic", "overarching goal",
)

ASSIGNMENT_ANCHOR_PATTERNS: Tuple[Tuple[re.Pattern, int], ...] = (
    (re.compile(r"^([A-Z][a-z]+)[,:]\s+(?:i|we)\s+(?:need|want)\s+you\s+to\b", re.I), 1),
    (re.compile(r"^([A-Z][a-z]+)[,:]\s+i\s+want\s+you\s+to\b", re.I), 1),
    (re.compile(r"^([A-Z][a-z]+)[,:]\s+(?:i am|i'm)\s+assigning\b", re.I), 1),
    (re.compile(r"^([A-Z][a-z]+)[,:]\s+you\s+are\s+officially\b", re.I), 1),
    (re.compile(r"^([A-Z][a-z]+)[,:]\s+you\s+are\s+now\b", re.I), 1),
    (re.compile(r"(?:i|we)\s+(?:need|want)\s+([A-Z][a-z]+)\s+to\b", re.I), 1),
)

TASK_CLAUSE_PATTERNS: Tuple[re.Pattern, ...] = (
    re.compile(
        r"your\s+(?:explicit\s+)?task\s+is\s+to\s+(.+?)"
        r"(?=\s*[\.\,]?\s*(?:your\s+deadline|deadline|by\s+\w+\s+\d))",
        re.I | re.S,
    ),
    re.compile(r"your\s+(?:explicit\s+)?task\s+is\s+to\s+(.+?)\.", re.I | re.S),
    re.compile(
        r"(?:need|want)\s+you\s+to\s+(.+?)(?=\s*[\.\,]?\s*(?:your\s+deadline|deadline))",
        re.I | re.S,
    ),
    re.compile(r"assigning\s+you\s+(?:the\s+)?task\s+of\s+(.+?)(?=\.|$)", re.I | re.S),
    re.compile(r"take\s+ownership\s+of\s+(?:the\s+)?(.+?)(?=\.|your\s+task)", re.I | re.S),
    re.compile(
        r"your\s+primary\s+goal\s+is\s+to\s+have\s+(.+?)"
        r"(?=\s*[\.\,]?\s*(?:following|your\s+next\s+deadline|by\s+\w+))",
        re.I | re.S,
    ),
    re.compile(r"i\s+want\s+you\s+to\s+(.+?)(?=\.|your\s+primary)", re.I | re.S),
    re.compile(r"officially\s+the\s+lead\s+on\s+(?:this\s+)?(.+?)(?=\.|i\s+want)", re.I | re.S),
)

DEADLINE_PATTERNS: Tuple[re.Pattern, ...] = (
    re.compile(
        r"(?:your|the)\s+deadline(?:\s+for|\s+to)?\s+"
        r"(?:having\s+)?(.+?)\s+is\s+"
        r"((?:january|february|march|april|may|june|july|august|september|"
        r"october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?)",
        re.I,
    ),
    re.compile(
        r"(?:your|the)\s+deadline\s+is\s+"
        r"((?:january|february|march|april|may|june|july|august|september|"
        r"october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?)",
        re.I,
    ),
    re.compile(
        r"(?:your\s+)?next\s+deadline\s+is\s+to\s+have\s+(.+?)\s+by\s+"
        r"((?:january|february|march|april|may|june|july|august|september|"
        r"october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?)",
        re.I,
    ),
    re.compile(
        r"by\s+((?:january|february|march|april|may|june|july|august|september|"
        r"october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?)",
        re.I,
    ),
)


@dataclass
class ActionItem:
    assignee: str
    tasks: List[str] = field(default_factory=list)
    deadline: str = "Not specified"
    confidence: float = 0.0
    start_index: int = -1

    def to_dict(self) -> Dict[str, object]:
        joined = "; ".join(self.tasks) if self.tasks else ""
        return {
            "assignee": self.assignee,
            "assigned_to": self.assignee,
            "tasks": list(self.tasks),
            "task": joined,
            "deadline": self.deadline,
            "confidence": round(self.confidence, 2),
        }


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def tokenize_sentences(transcript: str) -> List[str]:
    if not transcript or not transcript.strip():
        return []
    return [_normalize(s) for s in sent_tokenize(transcript.strip()) if _normalize(s)]


def is_valid_assignee(name: str) -> bool:
    if not name:
        return False
    if name.strip().lower() in NOT_PERSON_TERMS:
        return False
    return bool(re.fullmatch(r"[A-Z][a-z]{1,14}", name.strip()))


def is_skippable_sentence(sentence: str) -> bool:
    lower = sentence.lower()
    if len(lower.split()) < 4:
        return True
    if any(m in lower for m in RECAP_MARKERS):
        return True
    if any(m in lower for m in DISCUSSION_MARKERS):
        return True
    return False


def detect_assignment_anchor(sentence: str) -> Optional[str]:
    for pattern, group in ASSIGNMENT_ANCHOR_PATTERNS:
        match = pattern.search(sentence)
        if match:
            name = match.group(group).strip()
            if is_valid_assignee(name):
                return name
    vocative = re.match(r"^([A-Z][a-z]+)[,:]", sentence)
    if vocative and is_valid_assignee(vocative.group(1)):
        lower = sentence.lower()
        if any(
            p in lower
            for p in (
                "i need you to", "i want you to", "assigning you",
                "you are officially", "take ownership",
            )
        ):
            return vocative.group(1)
    return None


def is_valid_task(task: str) -> bool:
    """Reject dependency-parse fragments and incomplete phrases."""
    if not task:
        return False
    t = _normalize(task)
    words = t.split()
    if len(words) < MIN_TASK_WORDS or len(words) > MAX_TASK_WORDS:
        return False
    if FRAGMENT_STARTERS.match(t):
        return False
    if INCOMPLETE_ENDINGS.search(t):
        return False
    lower = t.lower()
    if any(m in lower for m in DISCUSSION_MARKERS):
        return False
    if lower in ("development environment", "staging environment", "next", "your next"):
        return False
    if any(m in lower for m in INCOMPLETE_FRAGMENT_MARKERS):
        return False
    if re.match(r"^(?:own|lead)\s+this\b", lower) and len(words) < 6:
        return False
    first = words[0].lower()
    if first in NON_ACTION_VERBS:
        return False
    if re.search(r"\b(?:so|because|since)\s+", lower):
        return False
    alpha_ratio = sum(c.isalpha() for c in t) / max(len(t), 1)
    if alpha_ratio < 0.5:
        return False
    return True


def _truncate_to_single_intent(text: str) -> str:
    """Keep first actionable clause; strip explanations and dangling text."""
    t = _normalize(text)
    t = EXPLANATION_CLAUSE_RE.sub("", t).strip()
    for marker in INCOMPLETE_FRAGMENT_MARKERS:
        idx = t.lower().find(marker)
        if idx > 10:
            t = t[:idx].strip()
    parts = re.split(r"\.\s+(?=[A-Z\"])", t)
    if parts:
        t = parts[0].strip()
    return t.rstrip(" .,;")


def _imperative_first_verb(text: str) -> str:
    """Normalize leading verb to imperative lemma; reject non-action roots."""
    doc = _NLP(text[:500])
    for token in doc:
        if token.dep_ not in ("ROOT", "xcomp") and token.pos_ != "VERB":
            continue
        if token.pos_ != "VERB":
            continue
        lemma = token.lemma_.lower()
        if lemma in NON_ACTION_VERBS:
            return ""
        if lemma in ("be", "have", "do"):
            continue
        rest = text[token.idx + len(token.text):].strip()
        rest = EXPLANATION_CLAUSE_RE.sub("", rest).strip()
        verb = lemma.capitalize()
        return f"{verb} {rest}".strip() if rest else verb
    return text


def normalize_task_imperative(task: str) -> str:
    """Strip junk, truncate, convert ownership phrases, imperative verb form."""
    t = _truncate_to_single_intent(task)
    for pat in TASK_JUNK_PREFIXES:
        t = pat.sub("", t).strip()
    t = re.sub(r"\s+from the backend apis\.?$", "", t, flags=re.I)
    t = t.strip(" .,;")
    if not t:
        return ""

    own_m = OWNERSHIP_ONLY.match(t)
    if own_m:
        subject = own_m.group(1).strip()
        t = f"Lead {subject}"

    t = _imperative_first_verb(t)
    if not t:
        return ""

    words = t.split()
    if words and words[0].lower() == "to":
        words = words[1:]
    if len(words) > MAX_IDEAL_TASK_WORDS:
        words = words[:MAX_IDEAL_TASK_WORDS]
    if not words:
        return ""

    words[0] = words[0].capitalize()
    return " ".join(words)


def _clean_task_fragment(fragment: str) -> str:
    return normalize_task_imperative(fragment)


def _task_similarity(a: str, b: str) -> float:
    a_norm = re.sub(r"[^a-z0-9\s]", "", a.lower())
    b_norm = re.sub(r"[^a-z0-9\s]", "", b.lower())
    return SequenceMatcher(None, a_norm, b_norm).ratio()


def _semantic_task_similarity(a: str, b: str) -> float:
    """Embedding similarity for near-duplicate tasks (outline vs write)."""
    try:
        from embedding_manager import encode
        from sklearn.metrics.pairwise import cosine_similarity

        vecs = encode([a, b])
        return float(cosine_similarity(vecs[0:1], vecs[1:2])[0, 0])
    except Exception:
        return 0.0


def _normalize_task_key(task: str) -> str:
    """Canonical key: lowercase, strip outline/write/draft verbs."""
    t = re.sub(r"[^a-z0-9\s]", "", task.lower())
    for verb in ("write", "outline", "draft", "prepare", "create", "document"):
        t = re.sub(rf"\b{verb}\b", "", t)
    return re.sub(r"\s+", " ", t).strip()


def deduplicate_tasks_fuzzy(tasks: Sequence[str]) -> List[str]:
    """Merge near-duplicate tasks (fuzzy text + optional semantic similarity)."""
    if not tasks:
        return []
    ordered = sorted(tasks, key=lambda t: -len(t))
    kept: List[str] = []
    kept_keys: List[str] = []
    for task in ordered:
        if not task:
            continue
        key = _normalize_task_key(task)
        dup = False
        for existing, ekey in zip(kept, kept_keys):
            if _task_similarity(task, existing) >= TASK_SIMILARITY_THRESHOLD:
                dup = True
                break
            if key and ekey and key == ekey:
                dup = True
                break
            if task.lower() in existing.lower() or existing.lower() in task.lower():
                dup = True
                break
            if _semantic_task_similarity(task, existing) >= 0.88:
                dup = True
                break
        if not dup:
            kept.append(task)
            kept_keys.append(key)
    return kept


def split_coordinated_actions(clause: str) -> List[str]:
    if not clause or not clause.strip():
        return []
    text = _normalize(clause)
    text = re.sub(r"\s+and\s+", ", ", text, flags=re.I)
    parts = [p.strip() for p in re.split(r",|;|(?:\s+then\s+)", text) if p.strip()]
    tasks: List[str] = []
    for part in parts:
        cleaned = _clean_task_fragment(part)
        if is_valid_task(cleaned):
            tasks.append(cleaned)
    return tasks


def extract_task_clauses_from_text(text: str) -> List[str]:
    combined = _normalize(text)
    clauses: List[str] = []
    for pattern in TASK_CLAUSE_PATTERNS:
        for match in pattern.finditer(combined):
            clause = match.group(1).strip().rstrip(" .")
            if clause and len(clause.split()) >= MIN_TASK_WORDS:
                clauses.append(clause)
    return clauses


def _collect_subtree_tokens(token, *, include_aux: bool = True) -> List[str]:
    """Gather tokens in dependency subtree in linear order."""
    tokens = sorted(
        [t for t in token.subtree if not t.is_punct and not t.is_space],
        key=lambda t: t.i,
    )
    if not include_aux:
        tokens = [t for t in tokens if t.dep_ not in ("aux", "auxpass") or t == token]
    return [t.text for t in tokens]


def reconstruct_from_verb(doc, verb_token) -> str:
    """
    Build a coherent task phrase from a verb and its objects/modifiers.
    """
    parts: List[str] = []
    verb_text = verb_token.lemma_ if verb_token.lemma_ != "be" else verb_token.text
    parts.append(verb_text)

    for child in verb_token.children:
        if child.dep_ in ("dobj", "attr", "oprd"):
            parts.extend(_collect_subtree_tokens(child))
        elif child.dep_ == "xcomp" and child.pos_ == "VERB":
            sub = reconstruct_from_verb(doc, child)
            if sub:
                parts.append(sub)

    for child in verb_token.children:
        if child.dep_ in ("prep", "agent"):
            prep_tokens = _collect_subtree_tokens(child)
            if prep_tokens and prep_tokens[0].lower() in (
                "for", "on", "with", "into", "to", "in",
            ):
                parts.extend(prep_tokens)

    phrase = " ".join(parts)
    phrase = re.sub(r"\s+", " ", phrase).strip()
    return _clean_task_fragment(phrase)


def extract_tasks_dependency(sentence: str) -> List[str]:
    """Extract full tasks using spaCy dependency patterns (not raw chunks)."""
    doc = _NLP(sentence)
    tasks: List[str] = []
    for token in doc:
        if token.pos_ != "VERB" and token.dep_ != "ROOT":
            continue
        lemma = token.lemma_.lower()
        if lemma not in ACTION_VERBS and token.text.lower() not in ACTION_VERBS:
            if not any(v in sentence.lower() for v in ("need you to", "want you to", "task is to")):
                continue
        phrase = reconstruct_from_verb(doc, token)
        if is_valid_task(phrase):
            tasks.append(phrase)
        for child in token.children:
            if child.dep_ == "xcomp" and child.pos_ == "VERB":
                sub = reconstruct_from_verb(doc, child)
                if is_valid_task(sub):
                    tasks.append(sub)
    return tasks


def semantic_merge_tasks(tasks: Sequence[str]) -> List[str]:
    """Normalize, validate, and fuzzy-deduplicate tasks."""
    normalized: List[str] = []
    for raw in tasks:
        task = normalize_task_imperative(raw)
        if is_valid_task(task):
            normalized.append(task)
    return deduplicate_tasks_fuzzy(normalized)


def extract_tasks_from_window(
    window_sentences: Sequence[str],
    assignee: str,
) -> List[str]:
    combined = " ".join(window_sentences)
    all_tasks: List[str] = []

    for clause in extract_task_clauses_from_text(combined):
        all_tasks.extend(split_coordinated_actions(clause))

    for sent in window_sentences:
        lower = sent.lower()
        if any(
            p in lower
            for p in ("need you to", "want you to", "task is to", "assigning you", "take ownership")
        ):
            all_tasks.extend(extract_tasks_dependency(sent))

    if not all_tasks:
        opener = window_sentences[0]
        m = re.search(
            r"(?:need|want)\s+you\s+to\s+(?:own|lead)\s+(?:this\s+)?(.+?)(?:\.|$)",
            opener,
            re.I,
        )
        if m:
            subject = m.group(1).strip()
            task = _clean_task_fragment(f"Lead {subject}")
            if is_valid_task(task):
                all_tasks.append(task)

    return semantic_merge_tasks(all_tasks)


def _is_strategic_deadline_context(text: str) -> bool:
    lower = text.lower()
    return any(m in lower for m in STRATEGIC_DATE_MARKERS) and "your deadline" not in lower


def extract_deadlines_from_window(window_sentences: Sequence[str]) -> List[str]:
    combined = " ".join(window_sentences)
    if _is_strategic_deadline_context(combined):
        return []
    dates: List[str] = []
    for pattern in DEADLINE_PATTERNS:
        for match in pattern.finditer(combined):
            date = match.group(match.lastindex).strip()
            if date and date not in dates:
                dates.append(date)
    return dates


def extract_deadline_task_pairs(
    window_sentences: Sequence[str],
) -> List[Tuple[str, str]]:
    combined = " ".join(window_sentences)
    pairs: List[Tuple[str, str]] = []
    for pattern in DEADLINE_PATTERNS:
        if "next deadline" not in pattern.pattern:
            continue
        for match in pattern.finditer(combined):
            if match.lastindex and match.lastindex >= 2:
                task_snip = _clean_task_fragment(match.group(1))
                date = match.group(2).strip()
                if task_snip and date and is_valid_task(task_snip):
                    pairs.append((task_snip, date))
    return pairs


def compute_confidence(
    assignee: str,
    tasks: Sequence[str],
    deadlines: Sequence[str],
    anchor_sentence: str,
) -> float:
    score = 0.0
    if is_valid_assignee(assignee):
        score += 0.35
    if tasks:
        score += 0.35
    if len(tasks) >= 2:
        score += 0.1
    if deadlines:
        score += 0.15
    if detect_assignment_anchor(anchor_sentence):
        score += 0.15
    avg_len = sum(len(t.split()) for t in tasks) / max(len(tasks), 1)
    if avg_len >= 5:
        score += 0.05
    return min(1.0, score)


def build_action_from_window(
    start_index: int,
    assignee: str,
    window_sentences: Sequence[str],
) -> Optional[ActionItem]:
    tasks = extract_tasks_from_window(window_sentences, assignee)
    deadlines = extract_deadlines_from_window(window_sentences)

    if not tasks:
        return None

    confidence = compute_confidence(
        assignee, tasks, deadlines, window_sentences[0]
    )
    if confidence < MIN_ACTION_CONFIDENCE:
        return None

    return ActionItem(
        assignee=assignee,
        tasks=tasks,
        deadline="; ".join(deadlines) if deadlines else "Not specified",
        confidence=confidence,
        start_index=start_index,
    )


def expand_dual_deadline_items(
    item: ActionItem,
    window_sentences: Sequence[str],
) -> List[ActionItem]:
    pairs = extract_deadline_task_pairs(window_sentences)
    if len(pairs) < 2:
        return [item]

    results: List[ActionItem] = []
    for task_snip, date in pairs:
        results.append(
            ActionItem(
                assignee=item.assignee,
                tasks=[task_snip],
                deadline=date,
                confidence=item.confidence,
                start_index=item.start_index,
            )
        )
    return results if results else [item]


def extract_tasks(transcript: str) -> List[dict]:
    if not transcript or not transcript.strip():
        return []

    sentences = tokenize_sentences(transcript)
    if not sentences:
        return []

    anchors: List[Tuple[int, str]] = []
    for i, sentence in enumerate(sentences):
        if is_skippable_sentence(sentence):
            continue
        assignee = detect_assignment_anchor(sentence)
        if assignee:
            anchors.append((i, assignee))

    if not anchors:
        return []

    results: List[ActionItem] = []
    for idx, (start, assignee) in enumerate(anchors):
        next_start = anchors[idx + 1][0] if idx + 1 < len(anchors) else len(sentences)
        window_end = min(start + 1 + CONTEXT_WINDOW_AFTER, next_start)
        window = sentences[start:window_end]
        item = build_action_from_window(start, assignee, window)
        if not item:
            continue
        results.extend(expand_dual_deadline_items(item, window))

    return deduplicate_actions([r.to_dict() for r in results])


def deduplicate_actions(actions: List[dict]) -> List[dict]:
    seen: Set[str] = set()
    unique: List[dict] = []
    for action in actions:
        assignee = action.get("assignee", "")
        tasks = deduplicate_tasks_fuzzy(action.get("tasks", []))
        action["tasks"] = tasks
        action["task"] = "; ".join(tasks)
        task_key = "|".join(sorted(t.lower() for t in tasks))
        key = f"{assignee}|{task_key[:120]}"
        if key not in seen and tasks:
            seen.add(key)
            unique.append(action)
    return unique
