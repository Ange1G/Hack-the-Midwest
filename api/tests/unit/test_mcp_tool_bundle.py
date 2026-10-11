import uuid
from datetime import UTC, datetime

import pytest

from app.core.secrets import SecretCipher
from app.domains.agents.models import Agent
from app.domains.connectors.models import Connector
from app.domains.connectors.repository import ConnectorWithSecrets
from app.worker.bundle import BundleBuildError, build_mcp_tool_bundle

MCP_ID = uuid.uuid4()
HTTP_ID = uuid.uuid4()
OTHER_ID = uuid.uuid4()


def _agent(mcp_id: uuid.UUID, allowed: list[str]) -> Agent:
    now = datetime.now(UTC)
    return Agent(
        id=uuid.uuid4(),
        title="Triage",
        system_prompt="Use Linear",
        configurations={
            "primitives": {str(mcp_id): {"allowedTools": allowed}},
        },
        owner_user_sso="sso-me",
        created_at=now,
        updated_at=now,
    )


def _mcp(cipher: SecretCipher | None = None, *, with_secret: bool = False) -> ConnectorWithSecrets:
    connector = Connector(
        id=MCP_ID,
        owner_user_sso="sso-me",
        type="mcp",
        name="linear",
        contract={
            "type": "mcp",
            "name": "linear",
            "config": {"URL": "https://mcp.example.com/mcp", "transport": "streamableHttp"},
            "options": {"timeout": 8000},
        },
    )
    ciphertexts: dict[str, str] = {}
    if with_secret:
        assert cipher is not None
        ciphertexts = {"authorizationHeader": cipher.encrypt("Bearer tok-secret")}
    return ConnectorWithSecrets(connector, ciphertexts)


def _http() -> ConnectorWithSecrets:
    return ConnectorWithSecrets(
        Connector(
            id=HTTP_ID,
            owner_user_sso="sso-me",
            type="http",
            name="issues",
            contract={"type": "http", "name": "issues", "config": {"URL": "https://api.example.com"}},
        ),
        {},
    )


async def test_mcp_bundle_intersects_allowlist_and_hides_secrets() -> None:
    cipher = SecretCipher(SecretCipher.generate_key())
    listed: list[tuple[str, dict[str, str]]] = []

    async def list_tools(url: str, headers: dict[str, str], timeout_s: float) -> list[str]:
        listed.append((url, headers))
        return ["list_issues", "create_issue", "delete_issue"]

    bundle = await build_mcp_tool_bundle(
        _agent(MCP_ID, ["list_issues", "create_issue"]),
        [_mcp(cipher, with_secret=True)],
        cipher,
        list_tools=list_tools,
    )
    assert bundle.servers == [
        {
            "id": str(MCP_ID),
            "name": "linear",
            "URL": "https://mcp.example.com/mcp",
            "transport": "streamableHttp",
            "tools": ["create_issue", "list_issues"],
            "timeout_ms": 8000,
        }
    ]
    assert bundle.credentials == {str(MCP_ID): {"authorizationHeader": "Bearer tok-secret"}}
    assert "tok-secret" not in str(bundle.servers)
    assert listed[0][0] == "https://mcp.example.com/mcp"
    assert listed[0][1]["Authorization"] == "Bearer tok-secret"


async def test_http_connectors_are_skipped() -> None:
    bundle = await build_mcp_tool_bundle(
        Agent(
            id=uuid.uuid4(),
            title="A",
            system_prompt="x",
            configurations={"primitives": {str(HTTP_ID): {}}},
            owner_user_sso="sso-me",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
        [_http()],
        cipher=None,
        list_tools=lambda *_a, **_k: _fail(),
    )
    assert bundle.servers == []
    assert bundle.credentials == {}


async def test_allowlisted_tool_missing_on_server_fails_closed() -> None:
    async def list_tools(url: str, headers: dict[str, str], timeout_s: float) -> list[str]:
        return ["list_issues"]

    with pytest.raises(BundleBuildError) as exc:
        await build_mcp_tool_bundle(
            _agent(MCP_ID, ["list_issues", "wipe_workspace"]),
            [_mcp()],
            cipher=None,
            list_tools=list_tools,
        )
    assert exc.value.code == "mcp_tool_missing"
    assert "wipe_workspace" in exc.value.message


async def test_foreign_connector_is_not_found() -> None:
    with pytest.raises(BundleBuildError) as exc:
        await build_mcp_tool_bundle(
            _agent(OTHER_ID, ["list_issues"]),
            [_mcp()],
            cipher=None,
            list_tools=lambda *_a, **_k: _fail(),
        )
    assert exc.value.code == "connector_missing"


async def _fail() -> list[str]:
    raise AssertionError("list_tools should not be called")
