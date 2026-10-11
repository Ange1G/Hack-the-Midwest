"""Keyword search over a knowledge connector's document snapshot (no network, no DB).

Documents are untrusted user content; results are returned to the model as data.
"""

from __future__ import annotations

import json
import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any

CHUNK_CHARS = 1_200
CHUNK_OVERLAP = 200
SNIPPET_CHARS = 700
READ_CHARS = 6_000
MAX_QUERY_CHARS = 500
MAX_SUMMARY_BODY_CHARS = 4_000
BM25_K1 = 1.5
BM25_B = 0.75
TITLE_WEIGHT = 0.5

_TOKEN = re.compile(r"[a-z0-9]+")
_STOPWORDS = frozenset(
    "a an and are as at be by for from has have how i in is it of on or that the this to "
    "was what when where which who why will with".split()
)


def tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(text.lower()) if t not in _STOPWORDS]


def chunk_text(body: str) -> list[str]:
    """Split on paragraph boundaries into ~CHUNK_CHARS pieces with a small overlap."""
    text = body.strip()
    if len(text) <= CHUNK_CHARS:
        return [text] if text else []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_CHARS, len(text))
        if end < len(text):
            boundary = text.rfind("\n\n", start + CHUNK_CHARS // 2, end)
            if boundary == -1:
                boundary = text.rfind(" ", start + CHUNK_CHARS // 2, end)
            if boundary != -1:
                end = boundary
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(end - CHUNK_OVERLAP, start + 1)
    return [chunk for chunk in chunks if chunk]


@dataclass(frozen=True)
class _Chunk:
    document_id: str
    title: str
    index: int
    text: str
    terms: Counter[str]
    title_terms: frozenset[str]
    length: int


class KnowledgeIndex:
    def __init__(self, entry: dict[str, Any]) -> None:
        self.name = str(entry.get("name") or "knowledge")
        self.description = entry.get("description")
        self.max_results = max(1, min(int(entry.get("max_results") or 5), 10))
        self._documents: dict[str, dict[str, str]] = {}
        self._chunks: list[_Chunk] = []
        for document in entry.get("documents") or []:
            if not isinstance(document, dict):
                continue
            document_id = str(document.get("id") or "")
            title = str(document.get("title") or "")
            body = str(document.get("body") or "")
            if not document_id:
                continue
            self._documents[document_id] = {"title": title, "body": body}
            title_terms = frozenset(tokenize(title))
            for index, text in enumerate(chunk_text(body)):
                terms = Counter(tokenize(text))
                self._chunks.append(
                    _Chunk(document_id, title, index, text, terms, title_terms, sum(terms.values()))
                )
        self._document_frequency: Counter[str] = Counter()
        for chunk in self._chunks:
            self._document_frequency.update(set(chunk.terms) | chunk.title_terms)
        total = sum(chunk.length for chunk in self._chunks)
        self._average_length = total / len(self._chunks) if self._chunks else 0.0

    @property
    def document_count(self) -> int:
        return len(self._documents)

    def search(self, query: str) -> list[dict[str, Any]]:
        terms = list(dict.fromkeys(tokenize(query[:MAX_QUERY_CHARS])))
        if not terms or not self._chunks:
            return []
        scored = []
        for chunk in self._chunks:
            score = sum(self._term_score(term, chunk) for term in terms)
            if score > 0:
                scored.append((score, chunk))
        scored.sort(key=lambda item: (-item[0], item[1].document_id, item[1].index))
        return [
            {
                "document_id": chunk.document_id,
                "title": chunk.title,
                "chunk": chunk.index,
                "score": round(score, 3),
                "snippet": chunk.text[:SNIPPET_CHARS],
            }
            for score, chunk in scored[: self.max_results]
        ]

    def read(self, document_id: str, offset: int = 0) -> dict[str, Any]:
        document = self._documents.get(str(document_id))
        if document is None:
            raise KeyError("Unknown document_id; use an id returned by search")
        body = document["body"]
        start = max(0, min(int(offset), len(body)))
        end = min(start + READ_CHARS, len(body))
        return {
            "document_id": str(document_id),
            "title": document["title"],
            "offset": start,
            "next_offset": end if end < len(body) else None,
            "text": body[start:end],
        }

    def _term_score(self, term: str, chunk: _Chunk) -> float:
        df = self._document_frequency.get(term, 0)
        if df == 0:
            return 0.0
        n = len(self._chunks)
        idf = math.log(1 + (n - df + 0.5) / (df + 0.5))
        frequency = chunk.terms.get(term, 0)
        score = 0.0
        if frequency:
            norm = 1 - BM25_B + BM25_B * (chunk.length / (self._average_length or 1))
            score += idf * (frequency * (BM25_K1 + 1)) / (frequency + BM25_K1 * norm)
        if term in chunk.title_terms:
            score += TITLE_WEIGHT * idf
        return score


def search_text(index: KnowledgeIndex, query: str) -> str:
    return json.dumps({"results": index.search(query)}, ensure_ascii=False)


def read_text(index: KnowledgeIndex, document_id: str, offset: int = 0) -> str:
    return json.dumps(index.read(document_id, offset), ensure_ascii=False)


def summarize_knowledge_call(index: KnowledgeIndex, tool: str, text: str) -> dict[str, Any]:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = {}
    if tool == "search":
        status = f"{len(parsed.get('results') or [])} results"
    else:
        status = f"read {len(parsed.get('text') or '')} chars"
    return {
        "name": f"{index.name}__{tool}",
        "connector": index.name,
        "status": status,
        "response_body": text[:MAX_SUMMARY_BODY_CHARS],
    }
