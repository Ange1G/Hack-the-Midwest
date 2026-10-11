import uuid
from datetime import UTC, datetime

import pytest

from app.core.secrets import SecretCipher
from app.domains.agents.models import Agent
from app.domains.connectors.models import Connector, ConnectorSecret
from app.worker.bundle import BundleBuildError, build_http_tool_bundle

HTTP_ID = uuid.uuid4()
MCP_ID = uuid.uuid4()
OTHER_ID = uuid.uuid4()


def _agent(*ids: uuid.UUID) -> Agent:
    now = datetime.now(UTC)
    return Agent(
        id=uuid.uuid4(),
        title="Digest",
        system_prompt="Use tools",
        configurations={"primitives": {str(i): {} for i in ids}},
        owner_user_sso="sso-me",
        created_at=now,
        updated_at=now,
    )


def _http(cipher: SecretCipher | None = None, *, with_secret: bool = False) -> tuple[Connector, list[ConnectorSecret]]:
    connector = Connector(
        id=HTTP_ID,
        owner_user_sso="sso-me",
        type="http",
        name="list_issues",
        contract={
            "type": "http",
            "name": "list_issues",
            "config": {"method": "GET", "URL": "https://api.example.com/issues"},
            "options": {"timeout": 5000, "retries": 1},
        },
    )
    secrets: list[ConnectorSecret] = []
    if with_secret:
        assert cipher is not None
        secrets = [
            ConnectorSecret(
                connector_id=HTTP_ID,
                field_name="xApiKey",
                ciphertext=cipher.encrypt("key-live"),
            )
        ]
    return connector, secrets


def _mcp() -> tuple[Connector, list[ConnectorSecret]]:
    return (
        Connector(
            id=MCP_ID,
            owner_user_sso="sso-me",
            type="mcp",
            name="linear",
            contract={"type": "mcp", "name": "linear", "config": {"URL": "https://mcp.example.com"}},
        ),
        [],
    )


def test_http_bundle_omits_secrets_from_tools() -> None:
    cipher = SecretCipher(SecretCipher.generate_key())
    bundle = build_http_tool_bundle(_agent(HTTP_ID), [_http(cipher, with_secret=True)], cipher)
    assert bundle.tools == [
        {
            "id": str(HTTP_ID),
            "name": "list_issues",
            "method": "GET",
            "URL": "https://api.example.com/issues",
            "timeout_ms": 5000,
            "retries": 1,
        }
    ]
    assert bundle.credentials == {str(HTTP_ID): {"xApiKey": "key-live"}}
    dumped = str(bundle.tools)
    assert "key-live" not in dumped


def test_mcp_connectors_are_skipped() -> None:
    bundle = build_http_tool_bundle(_agent(MCP_ID), [_mcp()], cipher=None)
    assert bundle.tools == []
    assert bundle.credentials == {}


def test_foreign_or_missing_connector_is_not_found() -> None:
    with pytest.raises(BundleBuildError) as exc:
        build_http_tool_bundle(_agent(OTHER_ID), [_http()], cipher=None)
    assert exc.value.code == "connector_missing"


def test_secrets_without_cipher_are_refused() -> None:
    cipher = SecretCipher(SecretCipher.generate_key())
    with pytest.raises(BundleBuildError) as exc:
        build_http_tool_bundle(_agent(HTTP_ID), [_http(cipher, with_secret=True)], cipher=None)
    assert exc.value.code == "secret_storage_unavailable"
