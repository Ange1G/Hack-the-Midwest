import uuid
from types import SimpleNamespace

import pytest

from app.domains.connectors.repository import ConnectorWithSecrets
from app.worker.bundle import BundleBuildError
from app.worker.run_context import (
    MAX_KNOWLEDGE_SNAPSHOT_BYTES,
    delegate_tool_name,
    knowledge_snapshot,
    run_context,
)


def _owned(connector_id: uuid.UUID, name: str = "runbooks") -> ConnectorWithSecrets:
    connector = SimpleNamespace(
        id=connector_id,
        name=name,
        type="knowledge",
        contract={"description": "Docs", "config": {"maxResults": 3}},
    )
    return ConnectorWithSecrets(connector, {})  # type: ignore[arg-type]


def _doc(connector_id: uuid.UUID, size: int, body: str = "text") -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(), connector_id=connector_id, title="T", body=body, size_bytes=size
    )


def test_delegate_tool_names_are_slugged_and_unique() -> None:
    used: set[str] = {"ask_research"}
    assert delegate_tool_name("Research", used) == "ask_research_2"
    assert delegate_tool_name("Research", used) == "ask_research_3"
    assert delegate_tool_name("  Ünïcode / Titles!! ", used) == "ask_n_code_titles"
    assert delegate_tool_name("!!!", used) == "ask_agent"
    long_name = delegate_tool_name("x" * 200, used)
    assert len(long_name) <= 48


def test_knowledge_snapshot_groups_documents_by_connector() -> None:
    first, second = uuid.uuid4(), uuid.uuid4()
    entries = knowledge_snapshot(
        [_owned(first), _owned(second, "other")],
        [str(first)],
        [_doc(first, 4, "kept"), _doc(second, 4, "not attached")],
    )
    assert len(entries) == 1
    assert entries[0]["max_results"] == 3
    assert [d["body"] for d in entries[0]["documents"]] == ["kept"]


def test_knowledge_snapshot_fails_closed_when_too_large() -> None:
    connector_id = uuid.uuid4()
    documents = [_doc(connector_id, MAX_KNOWLEDGE_SNAPSHOT_BYTES // 2 + 1) for _ in range(2)]
    with pytest.raises(BundleBuildError) as exc:
        knowledge_snapshot([_owned(connector_id)], [str(connector_id)], documents)
    assert exc.value.code == "knowledge_too_large"


def test_run_context_is_none_when_nothing_to_send() -> None:
    assert run_context(knowledge_ids_for_agent=[], knowledge=[], memory=None, delegates=[]) is None
    assert run_context(
        knowledge_ids_for_agent=[], knowledge=[], memory={"entries": {}}, delegates=[]
    ) == {"knowledge_ids": [], "knowledge": [], "memory": {"entries": {}}, "delegates": []}
