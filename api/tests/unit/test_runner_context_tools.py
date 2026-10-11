import io
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "runner"))

from delegate_tools import (  # noqa: E402
    MAX_DELEGATE_CALLS,
    MAX_TASK_CHARS,
    DelegateBudget,
    DelegateLimitError,
    delegate_task,
)
from knowledge_tools import (  # noqa: E402
    CHUNK_CHARS,
    READ_CHARS,
    KnowledgeIndex,
    chunk_text,
    search_text,
    summarize_knowledge_call,
)
from memory_tools import (  # noqa: E402
    MAX_MEMORY_KEYS,
    MemoryLimitError,
    MemoryStore,
    with_memory_writes,
)
from run_context import RunContextError, read_run_context  # noqa: E402
from tool_calls import MAX_ARGUMENT_CHARS, http_ok, tracked_call  # noqa: E402

ENTRY = {
    "id": "kb-1",
    "name": "runbooks",
    "description": "On-call runbooks",
    "max_results": 2,
    "documents": [
        {
            "id": "doc-pager",
            "title": "Pager escalation",
            "body": "If the primary does not acknowledge within 15 minutes, page the secondary.",
        },
        {
            "id": "doc-deploy",
            "title": "Deploys",
            "body": "Deploys freeze on Fridays. Roll back with the release dashboard.",
        },
        {"id": "doc-misc", "title": "Lunch", "body": "Tacos on Tuesday."},
    ],
}


# tool_calls


def test_tracked_call_records_kind_ok_duration_and_arguments() -> None:
    calls: list[dict] = []
    text = tracked_call(
        calls,
        kind="http",
        name="status",
        call=lambda: "HTTP 503 https://x\ndown",
        summarize=lambda t: {"name": "status", "status": t.split("\n")[0]},
        arguments={"query": {"q": "x" * 5000}},
        delegate="Researcher",
        ok=http_ok,
    )
    assert text.startswith("HTTP 503")
    [summary] = calls
    assert summary["kind"] == "http"
    assert summary["ok"] is False
    assert isinstance(summary["duration_ms"], int)
    assert len(summary["arguments"]) == MAX_ARGUMENT_CHARS
    assert summary["delegate"] == "Researcher"


def test_tracked_call_records_failures_and_reraises() -> None:
    calls: list[dict] = []

    def boom() -> str:
        raise ValueError("Query parameter 'admin' is not allowed")

    with pytest.raises(ValueError):
        tracked_call(calls, kind="mcp", name="linear__x", call=boom, summarize=lambda t: {})
    assert calls[0]["ok"] is False
    assert calls[0]["status"].startswith("error: Query parameter")
    assert "arguments" not in calls[0]


def test_http_ok_reads_status_codes() -> None:
    assert http_ok({"status": "HTTP 200 https://x"})
    assert not http_ok({"status": "HTTP 404 https://x"})
    assert http_ok({"status": "sent"})


# knowledge


def test_knowledge_search_ranks_relevant_passages_and_caps_results() -> None:
    index = KnowledgeIndex(ENTRY)
    hits = index.search("who do I page when the primary is not acknowledging?")
    assert hits[0]["document_id"] == "doc-pager"
    assert len(hits) <= 2
    assert index.search("tacos")[0]["document_id"] == "doc-misc"
    assert index.search("the and of") == []


def test_knowledge_title_terms_boost_matches() -> None:
    hits = KnowledgeIndex(ENTRY).search("deploys")
    assert hits[0]["document_id"] == "doc-deploy"


def test_knowledge_read_pages_long_documents() -> None:
    body = ("word " * 3000).strip()
    index = KnowledgeIndex({"name": "kb", "documents": [{"id": "d", "title": "T", "body": body}]})
    first = index.read("d")
    assert len(first["text"]) == READ_CHARS
    assert first["next_offset"] == READ_CHARS
    last = index.read("d", first["next_offset"] * 10)
    assert last["text"] == "" and last["next_offset"] is None
    with pytest.raises(KeyError):
        index.read("someone-elses-doc")


def test_chunking_splits_on_paragraphs_with_bounded_size() -> None:
    body = "\n\n".join(f"Paragraph {i} " + "text " * 60 for i in range(20))
    chunks = chunk_text(body)
    assert len(chunks) > 1
    assert all(len(chunk) <= CHUNK_CHARS for chunk in chunks)
    assert chunk_text("") == []


def test_knowledge_summary_counts_results() -> None:
    index = KnowledgeIndex(ENTRY)
    summary = summarize_knowledge_call(index, "search", search_text(index, "pager"))
    assert summary["name"] == "runbooks__search"
    assert summary["status"] == "1 results"
    assert "doc-pager" in summary["response_body"]


# memory


def test_memory_store_tracks_writes_and_deletes() -> None:
    store = MemoryStore({"old": "x", "keep": "y"})
    assert json.loads(store.get("keep"))["value"] == "y"
    assert json.loads(store.get("missing"))["found"] is False
    store.set("summary:site", "five bullets")
    store.delete("old")
    store.delete("never-existed")
    assert store.writes() == {"set": {"summary:site": "five bullets"}, "delete": ["old"]}
    keys = [item["key"] for item in json.loads(store.list())["keys"]]
    assert keys == ["keep", "summary:site"]


def test_memory_store_enforces_limits() -> None:
    store = MemoryStore({f"k{i}": i for i in range(MAX_MEMORY_KEYS)})
    with pytest.raises(MemoryLimitError):
        store.set("one_more", "v")
    store.set("k0", "updating an existing key is fine")
    with pytest.raises(MemoryLimitError):
        store.set("bad key!", "v")
    with pytest.raises(MemoryLimitError):
        MemoryStore({}).set("big", "x" * 5000)


def test_memory_writes_attach_only_to_successful_runs() -> None:
    store = MemoryStore({})
    store.set("k", "v")
    succeeded = with_memory_writes({"status": "succeeded", "result": {}}, store)
    assert succeeded["memory"] == {"set": {"k": "v"}, "delete": []}
    failed = with_memory_writes({"status": "failed", "error": {}}, store)
    assert "memory" not in failed
    untouched = with_memory_writes({"status": "succeeded"}, MemoryStore({}))
    assert "memory" not in untouched
    assert "memory" not in with_memory_writes({"status": "succeeded"}, None)


# run context and delegates


def test_read_run_context_disabled_or_valid() -> None:
    assert read_run_context(io.StringIO("ignored"), enabled=False)["delegates"] == []
    context = read_run_context(
        io.StringIO(json.dumps({"knowledge": [ENTRY], "memory": {"entries": {"a": 1}}})),
        enabled=True,
    )
    assert context["knowledge"][0]["id"] == "kb-1"
    assert context["memory"] == {"entries": {"a": 1}}
    assert context["knowledge_ids"] == []


def test_read_run_context_rejects_garbage() -> None:
    with pytest.raises(RunContextError):
        read_run_context(io.StringIO("not json"), enabled=True)
    with pytest.raises(RunContextError):
        read_run_context(io.StringIO("[1, 2]"), enabled=True)


def test_delegate_budget_caps_calls_per_run() -> None:
    budget = DelegateBudget()
    for _ in range(MAX_DELEGATE_CALLS):
        budget.take()
    with pytest.raises(DelegateLimitError):
        budget.take()


def test_delegate_task_is_trimmed_and_bounded() -> None:
    assert delegate_task("  find sources  ") == "find sources"
    assert len(delegate_task("x" * 10_000)) == MAX_TASK_CHARS
    with pytest.raises(ValueError):
        delegate_task("   ")


def test_entrypoint_compiles() -> None:
    import py_compile

    py_compile.compile(str(ROOT / "runner" / "entrypoint.py"), doraise=True)
