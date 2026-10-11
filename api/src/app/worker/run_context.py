"""Trusted-side run context sent to the container on stdin.

    { knowledge_ids, knowledge: [...], memory: {...} | null, delegates: [...] }

Credentials never go here: delegate connector credentials are merged into the HTTP and
MCP credential maps, keyed by connector id like the parent agent's.
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass, field
from typing import Any

from app.core.secrets import SecretCipher
from app.domains.agents.models import Agent
from app.domains.connectors.repository import ConnectorWithSecrets
from app.domains.knowledge.models import KnowledgeDocument
from app.domains.primitives.knowledge_contract import DEFAULT_SEARCH_RESULTS
from app.worker.bundle import (
    BundleBuildError,
    McpListTools,
    build_http_tool_bundle,
    build_mcp_tool_bundle,
    referenced_connector_ids,
)

MAX_KNOWLEDGE_SNAPSHOT_BYTES = 4_000_000
MAX_DELEGATE_TOOL_NAME = 48


@dataclass
class DelegateBundle:
    specs: list[dict[str, Any]] = field(default_factory=list)
    http_credentials: dict[str, dict[str, str]] = field(default_factory=dict)
    mcp_credentials: dict[str, dict[str, str]] = field(default_factory=dict)


def delegate_ids(agent: Agent) -> list[uuid.UUID]:
    raw = (agent.configurations or {}).get("delegates") or []
    ids: list[uuid.UUID] = []
    for value in raw:
        try:
            ids.append(uuid.UUID(str(value)))
        except ValueError:
            raise BundleBuildError(
                "delegate_missing", "Agent configuration references an invalid delegate id"
            ) from None
    return ids


def knowledge_ids(agent: Agent, owned: list[ConnectorWithSecrets]) -> list[str]:
    types = {item.connector.id: item.connector.type for item in owned}
    return [
        str(connector_id)
        for connector_id in referenced_connector_ids(agent)
        if types.get(connector_id) == "knowledge"
    ]


def knowledge_snapshot(
    owned: list[ConnectorWithSecrets],
    ids: list[str],
    documents: list[KnowledgeDocument],
) -> list[dict[str, Any]]:
    wanted = set(ids)
    by_connector: dict[str, list[dict[str, str]]] = {connector_id: [] for connector_id in wanted}
    total = 0
    for document in documents:
        connector_id = str(document.connector_id)
        if connector_id not in wanted:
            continue
        total += document.size_bytes
        if total > MAX_KNOWLEDGE_SNAPSHOT_BYTES:
            raise BundleBuildError(
                "knowledge_too_large",
                f"Attached knowledge exceeds {MAX_KNOWLEDGE_SNAPSHOT_BYTES} bytes for one run",
            )
        by_connector[connector_id].append(
            {"id": str(document.id), "title": document.title, "body": document.body}
        )
    entries = []
    for item in owned:
        connector_id = str(item.connector.id)
        if connector_id not in wanted:
            continue
        contract = item.connector.contract or {}
        config = contract.get("config") or {}
        entries.append(
            {
                "id": connector_id,
                "name": item.connector.name,
                "description": contract.get("description"),
                "max_results": int(config.get("maxResults") or DEFAULT_SEARCH_RESULTS),
                "documents": by_connector[connector_id],
            }
        )
    return entries


def delegate_tool_name(title: str, used: set[str]) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_") or "agent"
    base = f"ask_{slug}"[:MAX_DELEGATE_TOOL_NAME].rstrip("_")
    name = base
    suffix = 2
    while name in used:
        name = f"{base[: MAX_DELEGATE_TOOL_NAME - 3]}_{suffix}"
        suffix += 1
    used.add(name)
    return name


async def build_delegate_bundle(
    delegates: list[Agent],
    owned: list[ConnectorWithSecrets],
    cipher: SecretCipher | None,
    *,
    list_tools: McpListTools,
    reserved_names: set[str],
) -> DelegateBundle:
    """Tool specs per delegate, built with the same allowlist rules as the parent's."""
    bundle = DelegateBundle()
    types = {item.connector.id: item.connector.type for item in owned}
    used = set(reserved_names)
    for delegate in delegates:
        referenced = referenced_connector_ids(delegate)
        if any(types.get(connector_id) == "database" for connector_id in referenced):
            raise BundleBuildError(
                "delegate_unsupported",
                f"Delegate '{delegate.title}' uses a database connector, which delegates "
                "cannot use",
            )
        http = build_http_tool_bundle(delegate, owned, cipher)
        mcp = await build_mcp_tool_bundle(delegate, owned, cipher, list_tools=list_tools)
        bundle.http_credentials.update(http.credentials)
        bundle.mcp_credentials.update(mcp.credentials)
        bundle.specs.append(
            {
                "tool_name": delegate_tool_name(delegate.title, used),
                "agent_id": str(delegate.id),
                "title": delegate.title,
                "system_prompt": delegate.system_prompt,
                "http_tools": http.tools,
                "mcp_servers": mcp.servers,
                "knowledge_ids": knowledge_ids(delegate, owned),
            }
        )
    return bundle


def run_context(
    *,
    knowledge_ids_for_agent: list[str],
    knowledge: list[dict[str, Any]],
    memory: dict[str, Any] | None,
    delegates: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if not knowledge and memory is None and not delegates:
        return None
    return {
        "knowledge_ids": knowledge_ids_for_agent,
        "knowledge": knowledge,
        "memory": memory,
        "delegates": delegates,
    }


def encode_run_context(context: dict[str, Any]) -> str:
    return json.dumps(context, separators=(",", ":"), default=str)
