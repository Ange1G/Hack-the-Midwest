"""Trusted-side HTTP tool bundle for a claimed execution."""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from app.core.config import Settings
from app.core.secrets import SecretCipher
from app.domains.agents.models import Agent
from app.domains.connectors.models import Connector
from app.domains.connectors.repository import ConnectorWithSecrets
from app.runtime.agent_databases import DatabaseConnection

DEFAULT_TIMEOUT_MS = 10_000
DEFAULT_ROW_LIMIT = 100
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})
CONTAINER_DB_HOST = "host.docker.internal"


class BundleBuildError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class HttpToolBundle:
    tools: list[dict[str, Any]]
    credentials: dict[str, dict[str, str]]


@dataclass(frozen=True)
class DatabaseToolBundle:
    tools: list[dict[str, Any]]
    credentials: dict[str, dict[str, str]]


@dataclass(frozen=True)
class McpToolBundle:
    servers: list[dict[str, Any]]
    credentials: dict[str, dict[str, str]]


McpListTools = Callable[[str, dict[str, str], float], Awaitable[list[str]]]


def cipher_from_settings(settings: Settings) -> SecretCipher | None:
    secret = settings.secrets_encryption_key
    if secret is None:
        return None
    value = secret.get_secret_value().strip()
    if not value:
        return None
    try:
        return SecretCipher(value)
    except ValueError as exc:
        raise BundleBuildError(
            "secret_storage_misconfigured",
            "Credential storage is misconfigured on this server",
        ) from exc


def referenced_connector_ids(agent: Agent) -> list[uuid.UUID]:
    primitives = (agent.configurations or {}).get("primitives") or {}
    ids: list[uuid.UUID] = []
    for raw in primitives.keys():
        try:
            ids.append(uuid.UUID(str(raw)))
        except ValueError:
            raise BundleBuildError(
                "connector_missing",
                "Agent configuration references an invalid connector id",
            ) from None
    return ids


def build_http_tool_bundle(
    agent: Agent,
    owned: list[ConnectorWithSecrets],
    cipher: SecretCipher | None,
) -> HttpToolBundle:
    requested = referenced_connector_ids(agent)
    by_id = {item.connector.id: item for item in owned}
    if any(connector_id not in by_id for connector_id in requested):
        # Same message for missing and another tenant's id (do not leak existence).
        raise BundleBuildError("connector_missing", "Connector not found")

    tools: list[dict[str, Any]] = []
    credentials: dict[str, dict[str, str]] = {}
    for connector_id in requested:
        loaded = by_id[connector_id]
        connector = loaded.connector
        if connector.type != "http":
            continue
        decrypted = (
            _decrypt_ciphertexts(loaded.ciphertexts, cipher) if loaded.ciphertexts else {}
        )
        tools.append(_http_tool_spec(connector))
        if decrypted:
            credentials[str(connector.id)] = decrypted
    return HttpToolBundle(tools=tools, credentials=credentials)


async def build_mcp_tool_bundle(
    agent: Agent,
    owned: list[ConnectorWithSecrets],
    cipher: SecretCipher | None,
    *,
    list_tools: McpListTools,
) -> McpToolBundle:
    requested = referenced_connector_ids(agent)
    by_id = {item.connector.id: item for item in owned}
    if any(connector_id not in by_id for connector_id in requested):
        raise BundleBuildError("connector_missing", "Connector not found")

    servers: list[dict[str, Any]] = []
    credentials: dict[str, dict[str, str]] = {}
    for connector_id in requested:
        loaded = by_id[connector_id]
        connector = loaded.connector
        if connector.type != "mcp":
            continue
        decrypted = (
            _decrypt_ciphertexts(loaded.ciphertexts, cipher) if loaded.ciphertexts else {}
        )
        allowed = _allowed_mcp_tools(agent, connector_id)
        contract = connector.contract or {}
        config = contract.get("config") or {}
        options = contract.get("options") or {}
        url = config.get("URL")
        if not isinstance(url, str) or not url:
            raise BundleBuildError("mcp_unavailable", "MCP connector is missing a URL")
        timeout_ms = options.get("timeout") or DEFAULT_TIMEOUT_MS
        from app.worker.mcp_client import mcp_request_headers

        advertised = await list_tools(
            url, mcp_request_headers(decrypted), max(int(timeout_ms), 100) / 1000
        )
        missing = [name for name in allowed if name not in set(advertised)]
        if missing:
            raise BundleBuildError(
                "mcp_tool_missing",
                "MCP server does not advertise allowed tool(s): " + ", ".join(missing),
            )
        servers.append(
            {
                "id": str(connector.id),
                "name": connector.name,
                "URL": url,
                "transport": config.get("transport") or "streamableHttp",
                "tools": sorted(allowed),
                "timeout_ms": timeout_ms,
            }
        )
        if decrypted:
            credentials[str(connector.id)] = decrypted
    return McpToolBundle(servers=servers, credentials=credentials)


def _allowed_mcp_tools(agent: Agent, connector_id: uuid.UUID) -> list[str]:
    primitives = (agent.configurations or {}).get("primitives") or {}
    reference = primitives.get(str(connector_id)) or primitives.get(connector_id) or {}
    if not isinstance(reference, dict):
        names: list[Any] = []
    else:
        names = reference.get("allowedTools") or reference.get("allowed_tools") or []
    allowed = [str(name) for name in names if str(name).strip()]
    if not allowed:
        raise BundleBuildError(
            "mcp_tool_missing",
            "MCP connectors need allowedTools listing the tools this agent may call",
        )
    return allowed


def _decrypt_ciphertexts(
    ciphertexts: dict[str, str], cipher: SecretCipher | None
) -> dict[str, str]:
    if cipher is None:
        raise BundleBuildError(
            "secret_storage_unavailable",
            "Credential storage is not configured on this server",
        )
    return {field: cipher.decrypt(value) for field, value in ciphertexts.items()}


def _http_tool_spec(connector: Connector) -> dict[str, Any]:
    contract = connector.contract or {}
    config = contract.get("config") or {}
    options = contract.get("options") or {}
    timeout_ms = options.get("timeout") or DEFAULT_TIMEOUT_MS
    retries = options.get("retries") if options.get("retries") is not None else 0
    spec: dict[str, Any] = {
        "id": str(connector.id),
        "name": connector.name,
        "method": config.get("method", "GET"),
        "URL": config.get("URL"),
        "timeout_ms": timeout_ms,
        "retries": retries,
    }
    if config.get("payload") is not None:
        spec["payload"] = config["payload"]
    return spec


def build_database_tool_bundle(
    connections: dict[str, DatabaseConnection],
    *,
    container_host: str = CONTAINER_DB_HOST,
) -> DatabaseToolBundle:
    """Runner-facing specs. Passwords and CA material stay in the credentials map."""
    tools: list[dict[str, Any]] = []
    credentials: dict[str, dict[str, str]] = {}
    for connection in connections.values():
        host = (
            container_host if connection.host in LOOPBACK_HOSTS else connection.host
        )
        spec: dict[str, Any] = {
            "id": str(connection.connector_id),
            "name": connection.name,
            "engine": str(connection.engine),
            "host": host,
            "port": connection.port,
            "database": connection.database,
            "username": connection.username,
            "tls": connection.tls,
            "read_only": connection.read_only,
            "timeout_ms": connection.timeout_ms or DEFAULT_TIMEOUT_MS,
            "retries": connection.retries or 0,
            "row_limit": DEFAULT_ROW_LIMIT,
            "addresses": list(connection.addresses),
        }
        tools.append(spec)
        creds: dict[str, str] = {"password": connection.password}
        if connection.ca_certificate:
            creds["caCertificate"] = connection.ca_certificate
        credentials[str(connection.connector_id)] = creds
    return DatabaseToolBundle(tools=tools, credentials=credentials)
