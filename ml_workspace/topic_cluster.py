"""
Semantic topic clustering — UMAP + HDBSCAN + noun-phrase topic labels.
"""

from __future__ import annotations

import logging
import re
from collections import Counter
from typing import Dict, List, Optional, Sequence, Set

import numpy as np
import spacy
from nltk.tokenize import sent_tokenize
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import silhouette_score
from sklearn.metrics.pairwise import cosine_distances, cosine_similarity

from embedding_manager import encode as encode_sentences
from embedding_manager import load_embedding_model as preload_embedding_model
from preprocessor import filter_sentences_for_clustering

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

nlp = spacy.load("en_core_web_sm")

UMAP_NEIGHBORS = 6
UMAP_MIN_DIST = 0.08
UMAP_COMPONENTS = 12
HDBSCAN_MIN_CLUSTER_SIZE = 3
HDBSCAN_MIN_SAMPLES = 2
HDBSCAN_CLUSTER_SELECTION_EPSILON = 0.15

MIN_TOPIC_CLUSTER_SENTENCES = 3
MAX_CLUSTER_FRACTION = 0.38
MERGE_CLUSTER_SIMILARITY = 0.86
MIN_CLUSTER_COHERENCE = 0.42
MAX_CLUSTER_DIVERSITY = 0.32
NOISE_LABEL = -1

try:
    import umap
    _HAS_UMAP = True
except ImportError:
    _HAS_UMAP = False

try:
    import hdbscan
    _HAS_HDBSCAN = True
except ImportError:
    _HAS_HDBSCAN = False

DOMAIN_KEYWORDS = {
    "postgresql", "postgres", "replication", "pgbouncer", "aurora", "database",
    "redis", "elasticache", "caching", "cache",
    "kubernetes", "eks", "helm", "docker", "migration", "orchestration",
    "kafka", "msk", "messaging", "event-driven", "streaming",
    "microservices", "monolith", "architecture", "api", "backend",
    "throughput", "latency", "scaling", "infrastructure", "aws", "terraform",
    "security", "mtls", "istio", "observability", "deployment", "ci/cd",
    "pipeline", "nginx", "rds", "read replica", "devops",
}

THEME_LABEL_MAP = {
    ("postgresql", "postgres", "replication", "pgbouncer", "read replica"): "PostgreSQL Replication",
    ("redis", "elasticache", "caching", "cache", "invalidation"): "Redis Caching Strategy",
    ("kubernetes", "eks", "helm", "docker", "devops"): "Kubernetes Migration Strategy",
    ("kafka", "msk", "messaging", "event-driven", "streaming", "topic"): "Kafka Event Architecture",
    ("microservices", "monolith", "decompose", "service"): "Microservices Architecture",
    ("throughput", "latency", "scaling", "load", "bottleneck"): "Infrastructure Scaling",
    ("security", "mtls", "istio", "auth", "encryption", "mesh"): "Security & Service Mesh",
    ("terraform", "infrastructure", "aws", "vpc", "cloud", "planning"): "Infrastructure Planning",
    ("ci/cd", "pipeline", "jenkins", "github", "deploy"): "CI/CD Pipeline Migration",
}

LABEL_STOPWORDS = {
    "faster", "safer", "win", "session", "productive", "incredibly",
    "officially", "assign", "discussion", "meeting", "team", "everyone",
    "entire", "clear", "good", "great", "entire devops",
}

DOMAIN_STOPWORDS = frozenset({
    "system", "service", "services", "infrastructure", "application", "applications",
    "data", "need", "use", "using", "team", "architecture", "platform",
    "solution", "environment", "process", "approach", "thing", "things",
    "way", "lot", "bit", "really", "actually", "basically", "amazon", "aws",
})


def preload_embedding_model() -> None:
    load_embedding_model()


def _normalize(sentence: str) -> str:
    return re.sub(r"\s+", " ", sentence.strip())


def _prepare_clustering_sentences(
    transcript: str,
    semantic_sentences: Optional[Sequence[str]],
) -> List[str]:
    if semantic_sentences is not None:
        base = [s.strip() for s in semantic_sentences if s and s.strip()]
    else:
        base = [_normalize(s) for s in sent_tokenize(transcript.strip()) if _normalize(s)]
    filtered, removed = filter_sentences_for_clustering(base)
    if removed > 0:
        logger.info(
            "[SyncSpace AI] Filtered %d low-information sentences before clustering.",
            removed,
        )
    return filtered


def _reduce_umap(embeddings: np.ndarray) -> np.ndarray:
    n = len(embeddings)
    if not _HAS_UMAP:
        logger.warning("[SyncSpace AI] umap-learn not installed — using raw embeddings.")
        return embeddings

    logger.info("[SyncSpace AI] Running UMAP dimensionality reduction...")
    reducer = umap.UMAP(
        n_components=min(UMAP_COMPONENTS, max(2, n - 2)),
        n_neighbors=min(UMAP_NEIGHBORS, max(2, n - 1)),
        min_dist=UMAP_MIN_DIST,
        metric="cosine",
        random_state=42,
        n_jobs=1,
    )
    return reducer.fit_transform(embeddings)


def _cluster_hdbscan(reduced: np.ndarray) -> np.ndarray:
    if not _HAS_HDBSCAN:
        logger.warning("[SyncSpace AI] hdbscan not installed — single cluster fallback.")
        return np.zeros(len(reduced), dtype=int)

    logger.info("[SyncSpace AI] Running HDBSCAN clustering...")
    labels = hdbscan.HDBSCAN(
        min_cluster_size=HDBSCAN_MIN_CLUSTER_SIZE,
        min_samples=HDBSCAN_MIN_SAMPLES,
        metric="euclidean",
        cluster_selection_method="eom",
        cluster_selection_epsilon=HDBSCAN_CLUSTER_SELECTION_EPSILON,
        prediction_data=True,
    ).fit_predict(reduced)
    logger.info("[SyncSpace AI] Clustering complete.")
    return labels


def _cluster_coherence(embeddings: np.ndarray, indices: np.ndarray) -> float:
    if len(indices) < 2:
        return 1.0
    sub = embeddings[indices]
    sims = cosine_similarity(sub)
    n = len(indices)
    total = (sims.sum() - n) / (n * (n - 1))
    return float(total)


def _cluster_centroid(embeddings: np.ndarray, labels: np.ndarray, cid: int) -> np.ndarray:
    return embeddings[np.where(labels == cid)[0]].mean(axis=0)


def _merge_similar_mini_clusters(embeddings: np.ndarray, labels: np.ndarray) -> np.ndarray:
    labels = labels.copy()
    counts = Counter(int(l) for l in labels if l != NOISE_LABEL)
    if len(counts) < 2:
        return labels

    centroids = {cid: _cluster_centroid(embeddings, labels, cid) for cid in counts}
    large = [cid for cid, c in counts.items() if c >= MIN_TOPIC_CLUSTER_SENTENCES]

    for cid, cnt in counts.items():
        if cnt >= MIN_TOPIC_CLUSTER_SENTENCES or not large:
            continue
        vec = centroids[cid].reshape(1, -1)
        best_c, best_sim = large[0], -1.0
        for target in large:
            sim = float(cosine_similarity(vec, centroids[target].reshape(1, -1))[0, 0])
            if sim > best_sim:
                best_sim, best_c = sim, target
        if best_sim >= MERGE_CLUSTER_SIMILARITY:
            labels[labels == cid] = best_c
    return labels


def _cluster_diversity(embeddings: np.ndarray, indices: np.ndarray) -> float:
    """1 - mean pairwise similarity; high = semantically mixed cluster."""
    if len(indices) < 2:
        return 0.0
    sub = embeddings[indices]
    sims = cosine_similarity(sub)
    n = len(indices)
    mean_sim = (sims.sum() - n) / (n * (n - 1))
    return float(1.0 - mean_sim)


def _split_diverse_clusters(embeddings: np.ndarray, labels: np.ndarray) -> np.ndarray:
    """Secondary clustering when intra-cluster diversity is too high."""
    if not _HAS_UMAP or not _HAS_HDBSCAN:
        return labels
    labels = labels.copy()
    next_id = int(max(labels) + 1) if len(labels) else 0
    for cid in list(np.unique(labels)):
        cid = int(cid)
        if cid == NOISE_LABEL:
            continue
        idx = np.where(labels == cid)[0]
        if len(idx) < 8:
            continue
        if _cluster_diversity(embeddings, idx) <= MAX_CLUSTER_DIVERSITY:
            continue
        sub_emb = embeddings[idx]
        sub_reduced = umap.UMAP(
            n_components=min(8, max(2, len(sub_emb) - 2)),
            n_neighbors=min(5, max(2, len(sub_emb) - 1)),
            min_dist=0.1,
            metric="cosine",
            random_state=42,
        ).fit_transform(sub_emb)
        sub_labels = hdbscan.HDBSCAN(
            min_cluster_size=3,
            min_samples=2,
            metric="euclidean",
            cluster_selection_epsilon=0.12,
            prediction_data=True,
        ).fit_predict(sub_reduced)
        sub_unique = [c for c in np.unique(sub_labels) if c != NOISE_LABEL]
        if len(sub_unique) < 2:
            continue
        for sub_c in sub_unique:
            replace = idx[sub_labels == sub_c]
            if len(replace) >= MIN_TOPIC_CLUSTER_SENTENCES:
                labels[replace] = next_id
                next_id += 1
    return labels


def _split_giant_cluster(embeddings: np.ndarray, labels: np.ndarray) -> np.ndarray:
    if not _HAS_UMAP or not _HAS_HDBSCAN:
        return labels

    labels = labels.copy()
    n = len(labels)
    valid = [c for c in np.unique(labels) if c != NOISE_LABEL]
    if not valid:
        return labels

    dominant, dom_count = Counter(int(l) for l in labels if l != NOISE_LABEL).most_common(1)[0]
    if dom_count / n <= MAX_CLUSTER_FRACTION or dom_count < 10:
        return labels

    mask = labels == dominant
    sub_idx = np.where(mask)[0]
    sub_emb = embeddings[mask]
    sub_reduced = umap.UMAP(
        n_components=min(UMAP_COMPONENTS, max(2, len(sub_emb) - 2)),
        n_neighbors=min(UMAP_NEIGHBORS, max(2, len(sub_emb) - 1)),
        min_dist=UMAP_MIN_DIST,
        metric="cosine",
        random_state=42,
    ).fit_transform(sub_emb)
    sub_labels = hdbscan.HDBSCAN(
        min_cluster_size=max(3, HDBSCAN_MIN_CLUSTER_SIZE - 1),
        min_samples=HDBSCAN_MIN_SAMPLES,
        metric="euclidean",
        prediction_data=True,
    ).fit_predict(sub_reduced)

    next_id = max(valid) + 1
    for sub_c in np.unique(sub_labels):
        if sub_c == NOISE_LABEL:
            continue
        replace = sub_idx[sub_labels == sub_c]
        if len(replace) >= MIN_TOPIC_CLUSTER_SENTENCES:
            labels[replace] = next_id
            next_id += 1
    return labels


def _drop_tiny_and_incoherent(
    embeddings: np.ndarray,
    labels: np.ndarray,
) -> np.ndarray:
    labels = labels.copy()
    for cid in list(np.unique(labels)):
        cid = int(cid)
        if cid == NOISE_LABEL:
            continue
        idx = np.where(labels == cid)[0]
        if len(idx) < MIN_TOPIC_CLUSTER_SENTENCES:
            labels[idx] = NOISE_LABEL
            continue
        if _cluster_coherence(embeddings, idx) < MIN_CLUSTER_COHERENCE:
            labels[idx] = NOISE_LABEL
    return labels


def _sentence_domain_hits(sentence: str) -> Counter:
    low = sentence.lower()
    return Counter(
        t for t in DOMAIN_KEYWORDS if re.search(rf"\b{re.escape(t)}\b", low)
    )


def _domain_label_from_sentences(sentences: List[str]) -> Optional[str]:
    total: Counter = Counter()
    for s in sentences:
        total.update(_sentence_domain_hits(s))
    if not total:
        return None
    joined = " ".join(t for t, _ in total.most_common(8))
    best_label, best_score = None, 0
    for terms, label in THEME_LABEL_MAP.items():
        score = sum(1 for t in terms if t in joined)
        if score >= 2 and score > best_score:
            best_score, best_label = score, label
    if best_score >= 2:
        return best_label
    for terms, label in THEME_LABEL_MAP.items():
        if terms[0] in joined and total[terms[0]] >= 2:
            return label
    return None


def _extract_noun_phrase_themes(sentences: List[str], top_k: int = 4) -> List[str]:
    text = " ".join(sentences)[:8000]
    doc = nlp(text)
    phrases: Counter = Counter()
    for chunk in doc.noun_chunks:
        p = chunk.text.lower().strip()
        if len(p) < 4:
            continue
        if any(w in DOMAIN_STOPWORDS for w in p.split()):
            continue
        if re.search(
            r"\b(?:postgresql|postgres|kafka|redis|kubernetes|eks|docker|helm|"
            r"msk|replication|cache|replica|migration|pgbouncer|invalidation|streaming)\b",
            p,
        ):
            phrases[p] += 3
        elif re.search(r"\b(?:aws|api|database|pipeline)\b", p):
            phrases[p] += 1
    for ent in doc.ents:
        if ent.label_ in ("ORG", "PRODUCT"):
            el = ent.text.lower()
            if el not in DOMAIN_STOPWORDS:
                phrases[el] += 2
    return [p for p, _ in phrases.most_common(top_k)]


def _build_global_df(all_sentences: List[str]) -> Counter:
    """Document frequency across full transcript for IDF-style downweighting."""
    df: Counter = Counter()
    for s in all_sentences:
        tokens = set(re.findall(r"[a-z0-9]+(?:[-/][a-z0-9]+)*", s.lower()))
        for t in tokens:
            if t not in DOMAIN_STOPWORDS and len(t) > 2:
                df[t] += 1
    return df


def _term_score(term: str, tfidf_val: float, global_df: Counter, n_docs: int) -> float:
    tl = term.lower()
    score = tfidf_val
    if any(w in tl.split() for w in DOMAIN_STOPWORDS):
        score *= 0.25
    if tl in DOMAIN_KEYWORDS:
        score *= 2.0
    if " " in tl:
        score *= 1.6
    parts = tl.split()
    if len(parts) >= 2 and any(p in DOMAIN_KEYWORDS for p in parts):
        score *= 2.2
    doc_freq = sum(global_df.get(p, 0) for p in parts) / max(n_docs, 1)
    if doc_freq > 0.5 * n_docs:
        score *= 0.4
    return score


def _extract_tfidf_terms(
    sentences: List[str],
    top_k: int = 6,
    global_df: Optional[Counter] = None,
    n_docs: int = 1,
) -> List[str]:
    if not sentences:
        return []
    if global_df is None:
        global_df = Counter()
    custom_stop = list(DOMAIN_STOPWORDS) + list(LABEL_STOPWORDS)
    try:
        vec = TfidfVectorizer(
            max_features=60,
            stop_words=custom_stop,
            ngram_range=(2, 3),
            token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z0-9\-/]+\b",
        )
        matrix = vec.fit_transform(sentences)
        scores = matrix.sum(axis=0).A1
        terms = vec.get_feature_names_out()
        ranked = sorted(
            (
                (term, _term_score(term, float(sc), global_df, n_docs))
                for term, sc in zip(terms, scores)
            ),
            key=lambda x: -x[1],
        )
        out: List[str] = []
        seen: Set[str] = set()
        for term, _ in ranked:
            tl = term.lower()
            if tl in LABEL_STOPWORDS:
                continue
            key = tl.replace(" ", "-")[:40]
            if key in seen:
                continue
            seen.add(key)
            out.append(term)
            if len(out) >= top_k:
                break
        if len(out) < 2:
            vec2 = TfidfVectorizer(
                max_features=40,
                stop_words=custom_stop,
                ngram_range=(1, 2),
                token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z0-9\-/]+\b",
            )
            m2 = vec2.fit_transform(sentences)
            for term, sc in sorted(
                zip(vec2.get_feature_names_out(), m2.sum(axis=0).A1),
                key=lambda x: -x[1],
            ):
                tl = term.lower()
                if tl in DOMAIN_KEYWORDS and tl not in seen:
                    seen.add(tl)
                    out.append(term)
                    if len(out) >= top_k:
                        break
        return out
    except Exception:
        return []


def _is_bad_label(label: str) -> bool:
    words = label.lower().split()
    if len(words) < 2:
        return True
    if len(set(words)) < len(words) * 0.6:
        return True
    return any(w in LABEL_STOPWORDS for w in words) and not any(
        d in label.lower() for d in DOMAIN_KEYWORDS
    )


def generate_topic_label(sentences: List[str], used_labels: Set[str]) -> str:
    domain = _domain_label_from_sentences(sentences)
    if domain and domain not in used_labels:
        return domain

    # Noun-phrase driven label (not raw keyword concatenation)
    np_themes = _extract_noun_phrase_themes(sentences)
    if np_themes:
        primary = np_themes[0]
        if "postgres" in primary or "replication" in primary or "pgbouncer" in primary:
            candidate = "PostgreSQL Replication"
        elif "redis" in primary or "cache" in primary or "invalidation" in primary:
            candidate = "Redis Cache Invalidation"
        elif "kafka" in primary or "msk" in primary or "streaming" in primary:
            candidate = "Kafka Event Streaming"
        elif "eks" in primary or "kubernetes" in primary or "helm" in primary:
            candidate = "Kubernetes Migration"
        elif "security" in primary or "istio" in primary or "mtls" in primary:
            candidate = "Security & Service Mesh"
        else:
            candidate = " ".join(w.capitalize() for w in primary.split()[:4])
        if not _is_bad_label(candidate) and candidate not in used_labels:
            return candidate

    if domain:
        suffix = 2
        base = domain
        while base in used_labels:
            base = f"{domain} ({suffix})"
            suffix += 1
        return base

    fallback = "Technical Discussion"
    if fallback in used_labels:
        fallback = "Engineering Topic"
    return fallback


def _compute_silhouette(embeddings: np.ndarray, labels: np.ndarray) -> Optional[float]:
    valid = [int(l) for l in np.unique(labels) if l != NOISE_LABEL]
    if len(valid) < 2:
        return None
    if (labels == NOISE_LABEL).sum() > len(labels) * 0.85:
        return None
    mask = labels != NOISE_LABEL
    if len(set(labels[mask])) < 2:
        return None
    try:
        dist = cosine_distances(embeddings[mask])
        return float(silhouette_score(dist, labels[mask], metric="precomputed"))
    except Exception:
        return None


def report_cluster_quality(
    embeddings: np.ndarray,
    labels: np.ndarray,
    cluster_keywords: Dict[int, List[str]],
) -> None:
    valid = [int(l) for l in np.unique(labels) if l != NOISE_LABEL]
    noise_count = int((labels == NOISE_LABEL).sum())
    silhouette = _compute_silhouette(embeddings, labels)

    logger.info("[SyncSpace AI] Topic clustering report")
    logger.info("  Clusters      : %d", len(valid))
    logger.info("  Noise points  : %d", noise_count)
    logger.info(
        "  Silhouette    : %s",
        f"{silhouette:.3f}" if silhouette is not None else "n/a",
    )
    logger.info("  " + "-" * 36)
    for cid in sorted(valid):
        idx = np.where(labels == cid)[0]
        coh = _cluster_coherence(embeddings, idx)
        kws = ", ".join(cluster_keywords.get(cid, [])[:5])
        logger.info(
            "  Cluster %d (%d sents, coherence %.2f) | %s",
            cid, len(idx), coh, kws or "(none)",
        )


def _merge_fragmented_cluster_results(
    results: List[dict],
    embeddings: np.ndarray,
    sentences: List[str],
    labels: np.ndarray,
) -> List[dict]:
    """
    Merge clusters with highly similar centroids and overlapping topic names
    (e.g. multiple Redis or Kafka fragments).
    """
    if len(results) < 2:
        return results

    MERGE_SIM = 0.88
    merged: List[dict] = []
    used: Set[int] = set()

    def _centroid_for_cluster(r: dict) -> Optional[np.ndarray]:
        sents = r.get("sentences", [])
        if not sents:
            return None
        idx = [i for i, s in enumerate(sentences) if s in sents]
        if not idx:
            return None
        return embeddings[idx].mean(axis=0)

    for i, a in enumerate(results):
        if i in used:
            continue
        combined = dict(a)
        used.add(i)
        ca = _centroid_for_cluster(a)
        for j, b in enumerate(results[i + 1:], start=i + 1):
            if j in used:
                continue
            cb = _centroid_for_cluster(b)
            if ca is None or cb is None:
                continue
            sim = float(cosine_similarity(ca.reshape(1, -1), cb.reshape(1, -1))[0, 0])
            name_a = (a.get("topic_name") or "").lower()
            name_b = (b.get("topic_name") or "").lower()
            shared_domain = any(
                d in name_a and d in name_b
                for d in ("redis", "kafka", "postgres", "kubernetes", "eks", "cache")
            )
            if sim >= MERGE_SIM or (shared_domain and sim >= 0.8):
                combined["sentences"] = list(dict.fromkeys(
                    combined.get("sentences", []) + b.get("sentences", [])
                ))
                combined["keywords"] = list(dict.fromkeys(
                    combined.get("keywords", []) + b.get("keywords", [])
                ))
                used.add(j)
        combined["topic_name"] = generate_topic_label(
            combined.get("sentences", []), {m.get("topic_name", "") for m in merged}
        )
        merged.append(combined)

    return sorted(merged, key=lambda b: len(b["sentences"]), reverse=True)


def build_cluster_results(
    sentences: List[str],
    embeddings: np.ndarray,
    labels: np.ndarray,
) -> List[dict]:
    used_labels: Set[str] = set()
    buckets: Dict[int, dict] = {}
    cluster_keywords: Dict[int, List[str]] = {}
    global_df = _build_global_df(sentences)
    n_docs = max(len(sentences), 1)

    for cid in sorted(np.unique(labels)):
        cid = int(cid)
        if cid == NOISE_LABEL:
            continue
        member_idx = np.where(labels == cid)[0]
        member_sents = [sentences[i] for i in member_idx]
        if len(member_sents) < MIN_TOPIC_CLUSTER_SENTENCES:
            continue
        if _cluster_coherence(embeddings, member_idx) < MIN_CLUSTER_COHERENCE:
            continue

        kws = list(dict.fromkeys(
            _extract_tfidf_terms(member_sents, global_df=global_df, n_docs=n_docs)
            + _extract_noun_phrase_themes(member_sents, 3)
        ))
        cluster_keywords[cid] = kws
        name = generate_topic_label(member_sents, used_labels)
        used_labels.add(name)
        buckets[cid] = {
            "topic_id": cid,
            "topic_name": name,
            "keywords": kws,
            "sentences": member_sents,
            "coherence": round(_cluster_coherence(embeddings, member_idx), 3),
        }

    report_cluster_quality(embeddings, labels, cluster_keywords)
    return sorted(buckets.values(), key=lambda b: len(b["sentences"]), reverse=True)


def cluster_topics(
    transcript: str,
    num_clusters: Optional[int] = None,
    semantic_sentences: Optional[Sequence[str]] = None,
) -> list:
    del num_clusters  # HDBSCAN determines k; no forced Agglomerative

    sentences = _prepare_clustering_sentences(transcript, semantic_sentences)
    n = len(sentences)
    if n == 0:
        logger.warning("[SyncSpace AI] No sentences available for clustering.")
        return []
    if n < 4:
        logger.warning("[SyncSpace AI] Only %d sentences for clustering.", n)

    embeddings = encode_sentences(sentences)

    if _HAS_UMAP and _HAS_HDBSCAN:
        reduced = _reduce_umap(embeddings)
        labels = _cluster_hdbscan(reduced)
        if len(set(labels) - {NOISE_LABEL}) == 0:
            logger.warning("[SyncSpace AI] HDBSCAN returned all noise — no fallback merge.")
        labels = _split_giant_cluster(embeddings, labels)
        labels = _split_diverse_clusters(embeddings, labels)
        labels = _merge_similar_mini_clusters(embeddings, labels)
        labels = _drop_tiny_and_incoherent(embeddings, labels)
        # Do not aggressively reassign noise (prevents deadline/infra mixing)
    else:
        logger.warning("[SyncSpace AI] Missing umap-learn or hdbscan.")
        labels = np.full(n, NOISE_LABEL, dtype=int)

    results = build_cluster_results(sentences, embeddings, labels)
    results = _merge_fragmented_cluster_results(results, embeddings, sentences, labels)
    if not results and n > 0:
        return [{
            "topic_name": generate_topic_label(sentences, set()),
            "keywords": _extract_tfidf_terms(sentences),
            "sentences": sentences,
        }]
    return results
