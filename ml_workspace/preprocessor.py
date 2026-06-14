
# SyncSpace AI — Transcript preprocessor (readable + semantic streams)

import re
import logging
from typing import List, Sequence, Tuple

import nltk
import spacy

from nltk.corpus import stopwords
from nltk.tokenize import sent_tokenize

logger = logging.getLogger(__name__)

nltk.download("punkt", quiet=True)
nltk.download("punkt_tab", quiet=True)
nltk.download("stopwords", quiet=True)

nlp = spacy.load("en_core_web_sm")
STOP_WORDS = set(stopwords.words("english"))

MIN_CLUSTERING_WORDS = 8
MIN_TECH_DENSITY_SCORE = 2.5

FILLER_PHRASES = (
    "thank you",
    "thanks for taking the time",
    "thanks everyone",
    "thanks all",
    "sounds good",
    "makes sense",
    "absolutely",
    "alright",
    "all right",
    "alright everyone",
    "okay",
    "ok",
    "perfect",
    "got it",
    "i've got it",
    "i got it",
    "i agree",
    "exactly",
    "right",
    "correct",
    "sure",
    "understood",
    "fair enough",
    "good point",
    "great point",
    "let's get started",
    "let us get started",
    "let's make the call",
    "let us make the call",
    "this was productive",
    "this has been productive",
    "productive session",
    "incredibly productive",
    "great session",
    "good discussion",
    "no objections",
    "that works for me",
    "i'm aligned",
    "i am aligned",
    "yes absolutely",
    "okay great",
    "let's close out",
    "let us close out",
    "welcome everyone",
    "good morning",
    "good afternoon",
)

CLUSTERING_EXCLUDE_PATTERNS = (
    "faster, safer win",
    "faster safer win",
    "let's officially assign",
    "officially assign this",
    "solid foundation",
    "close out here",
    "just to recap",
    "to recap",
    "good call",
    "well done",
    "appreciate everyone",
)

PRESERVE_SIGNALS = (
    "deadline", "due by", "need you to", "want you to", "assigning",
    "take ownership", "your task", "read replica", "risk", "concern",
    "bottleneck", "migration", "architect", "replication",
)

TECH_PRESERVE_PATTERN = re.compile(
    r"\b(?:aws|eks|ecs|kafka|msk|redis|postgresql|postgres|pgbouncer|"
    r"kubernetes|k8s|docker|helm|istio|terraform|elasticache|aurora|"
    r"microservices|monolith|api|graphql|grpc|ci/?cd|json|yaml|"
    r"replication|caching|orchestration|serverless|vpc|iam|mtls|"
    r"observability|latency|throughput|scaling|deployment|pipeline|"
    r"database|messaging|backend|frontend|nginx|rds|read\s+replica)\b",
    re.I,
)

DATE_PATTERN = re.compile(
    r"\b(?:january|february|march|april|may|june|july|august|"
    r"september|october|november|december)\s+\d{1,2}",
    re.I,
)

ACTION_VERB_PATTERN = re.compile(
    r"\b(?:configure|provision|deploy|migrate|implement|architect|"
    r"design|build|integrate|replicate|scale|monitor|finalize)\w*\b",
    re.I,
)


def get_stop_phrases() -> tuple:
    return FILLER_PHRASES


def split_into_sentences(transcript: str) -> list:
    if not transcript or not transcript.strip():
        return []
    return [s.strip() for s in sent_tokenize(transcript.strip()) if s.strip()]


def clean_sentence(sentence: str) -> str:
    return re.sub(r"\s+", " ", sentence).strip()


def build_readable_sentences(sentences: list) -> list:
    return [clean_sentence(s) for s in sentences if clean_sentence(s)]


def _normalize_alpha(sentence: str) -> str:
    return re.sub(r"[^a-z\s]", "", sentence.lower()).strip()


def matches_stop_phrase(sentence: str, phrases: tuple = FILLER_PHRASES) -> bool:
    lower = sentence.lower().strip()
    alpha = _normalize_alpha(sentence)
    if alpha in phrases:
        return True
    words = lower.split()
    if len(words) <= 10:
        for phrase in phrases:
            if phrase in lower and len(words) <= len(phrase.split()) + 5:
                return True
    if len(words) <= 2 and alpha in ("right", "exactly", "sure", "ok", "okay", "absolutely"):
        return True
    return False


def _must_preserve(sentence: str) -> bool:
    lower = sentence.lower()
    if DATE_PATTERN.search(sentence):
        return True
    if any(sig in lower for sig in PRESERVE_SIGNALS):
        return True
    if TECH_PRESERVE_PATTERN.search(sentence) and len(sentence.split()) >= 6:
        return True
    return False


def technical_density_score(sentence: str) -> float:
    """
    Score substantive technical content for clustering eligibility.
    Higher = more likely to belong in embedding/cluster pipeline.
    """
    if not sentence.strip():
        return 0.0

    lower = sentence.lower()
    score = 0.0

    tech_hits = len(TECH_PRESERVE_PATTERN.findall(sentence))
    score += tech_hits * 1.2

    if DATE_PATTERN.search(sentence):
        score += 1.5

    if ACTION_VERB_PATTERN.search(sentence):
        score += 0.8

    doc = nlp(sentence[:2000])
    tech_nouns = sum(
        1 for t in doc
        if t.pos_ in ("NOUN", "PROPN")
        and (TECH_PRESERVE_PATTERN.search(t.text) or t.text.lower() not in STOP_WORDS)
        and len(t.text) > 2
    )
    score += tech_nouns * 0.35

    entities = sum(1 for ent in doc.ents if ent.label_ in ("ORG", "PRODUCT", "GPE"))
    score += entities * 0.5

    nums = len(re.findall(r"\b\d+\b", sentence))
    score += min(nums, 3) * 0.25

    words = len(sentence.split())
    if words > 0:
        content = sum(
            1 for t in re.findall(r"[a-z0-9]+", lower)
            if t not in STOP_WORDS and len(t) > 2
        )
        score += (content / words) * 2.0

    if any(p in lower for p in ("risk", "concern", "bottleneck", "latency", "throughput")):
        score += 0.6

    return score


def is_clustering_sentence(sentence: str) -> bool:
    if not sentence or not sentence.strip():
        return False

    if _must_preserve(sentence):
        if matches_stop_phrase(sentence) and technical_density_score(sentence) < 3.0:
            return False
        return True

    if matches_stop_phrase(sentence):
        return False
    if any(p in sentence.lower() for p in CLUSTERING_EXCLUDE_PATTERNS):
        return False

    if len(sentence.split()) < MIN_CLUSTERING_WORDS:
        return False

    return technical_density_score(sentence) >= MIN_TECH_DENSITY_SCORE


def filter_sentences_for_clustering(sentences: Sequence[str]) -> Tuple[List[str], int]:
    kept: List[str] = []
    removed = 0
    seen: set = set()
    for s in sentences:
        s = clean_sentence(s)
        if not s:
            continue
        key = _normalize_alpha(s)
        if key in seen:
            removed += 1
            continue
        if is_clustering_sentence(s):
            seen.add(key)
            kept.append(s)
        else:
            removed += 1
    return kept, removed


def build_semantic_sentences(readable: list) -> list:
    kept, _ = filter_sentences_for_clustering(readable)
    return kept


def preprocess_transcript(transcript: str) -> dict:
    empty = {
        "readable_sentences": [],
        "clean_sentences": [],
        "semantic_sentences": [],
        "processed_sentences": [],
        "clustering_filtered_count": 0,
    }
    if not transcript or not transcript.strip():
        return empty

    sentences = split_into_sentences(transcript)
    if not sentences:
        return empty

    readable = build_readable_sentences(sentences)
    semantic, filtered_count = filter_sentences_for_clustering(readable)

    if filtered_count > 0:
        logger.info(
            "[SyncSpace AI] Filtered %d low-information sentences before clustering.",
            filtered_count,
        )

    return {
        "readable_sentences": readable,
        "clean_sentences": readable,
        "semantic_sentences": semantic,
        "processed_sentences": [],
        "clustering_filtered_count": filtered_count,
    }
