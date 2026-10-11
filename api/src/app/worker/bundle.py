"""Trusted-side HTTP tool bundle for a claimed execution."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from app.core.config import Settings
from app.core.secrets import SecretCipher
from app.domains.agents.models import Agent
from app.domains.connectors.models import Connector, ConnectorSecret

DEFAULT_TIMEOUT_MS = 10_000


class BundleBuildError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class HttpToolBundle:
    tools: list[dict[str, Any]]
    credentials: dict[str, dict[str, str]]


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
    owned: list[tuple[Connector, list[ConnectorSecret]]],
    cipher: SecretCipher | None,
) -> HttpToolBundle:
    requested = referenced_connector_ids(agent)
    by_id = {connector.id: (connector, secrets) for connector, secrets in owned}
    if any(connector_id not in by_id for connector_id in requested):
        # Same message for missing and another tenant's id (do not leak existence).
        raise BundleBuildError("connector_missing", "Connector not found")

    tools: list[dict[str, Any]] = []
    credentials: dict[str, dict[str, str]] = {}
    for connector_id in requested:
        connector, secrets = by_id[connector_id]
        if connector.type != "http":
            continue
        decrypted = _decrypt_secrets(secrets, cipher) if secrets else {}
        tools.append(_http_tool_spec(connector))
        if decrypted:
            credentials[str(connector.id)] = decrypted
    return HttpToolBundle(tools=tools, credentials=credentials)


def _decrypt_secrets(
    secrets: list[ConnectorSecret], cipher: SecretCipher | None
) -> dict[str, str]:
    if cipher is None:
        raise BundleBuildError(
            "secret_storage_unavailable",
            "Credential storage is not configured on this server",
        )
    return {secret.field_name: cipher.decrypt(secret.ciphertext) for secret in secrets}


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
