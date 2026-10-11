import uuid
from collections.abc import Collection
from datetime import UTC, datetime
from typing import Any

import pytest

from app.core.auth import CurrentUser
from app.core.config import Settings
from app.core.exceptions import AppError, ForbiddenError
from app.core.secrets import SecretCipher
from app.domains.connectors.models import Connector, ConnectorSecret
from app.domains.connectors.repository import ConnectorNameTaken
from app.domains.connectors.service import ConnectorService
from app.domains.primitives.base import SECRET_PLACEHOLDER

ME = CurrentUser(user_sso="sso-me")

HTTP = {
    "type": "http",
    "contractVersion": 1,
    "name": "create_issue",
    "credentials": {"xApiKey": "key-123", "authorizationHeader": "Bearer abc"},
    "config": {"method": "POST", "URL": "https://api.example.com/issues", "payload": {"t": 1}},
}


class RecordingRepository:
    def __init__(self, *, name_taken: bool = False) -> None:
        self.created: list[tuple[Connector, list[ConnectorSecret]]] = []
        self.name_taken = name_taken
        self.listed: list[tuple[str, int, int]] = []

    async def list_by_owner(
        self, owner_user_sso: str, *, page: int, page_size: int
    ) -> tuple[list[Connector], int]:
        self.listed.append((owner_user_sso, page, page_size))
        return [], 0

    async def create(self, connector: Connector, secrets: list[ConnectorSecret]) -> Connector:
        if self.name_taken:
            raise ConnectorNameTaken(connector.name)
        now = datetime.now(UTC)
        connector.id = uuid.uuid4()
        connector.created_at = now
        connector.updated_at = now
        self.created.append((connector, secrets))
        return connector

    async def types_by_id(
        self, owner_user_sso: str, ids: Collection[uuid.UUID]
    ) -> dict[uuid.UUID, str]:
        return {}

    async def get_with_secrets(
        self, owner_user_sso: str, ids: Collection[uuid.UUID]
    ) -> list:
        return []


def cipher() -> SecretCipher:
    return SecretCipher(SecretCipher.generate_key())


async def test_creates_connector_with_encrypted_masked_credentials() -> None:
    repo, c = RecordingRepository(), cipher()
    result = await ConnectorService(repo).create_connector("sso-me", HTTP, caller=ME, cipher=c)

    assert result.type == "http" and result.name == "create_issue"
    assert result.owner_user_sso == "sso-me"
    assert result.contract["credentials"] == {
        "xApiKey": SECRET_PLACEHOLDER,
        "authorizationHeader": SECRET_PLACEHOLDER,
    }
    assert result.contract["config"]["URL"] == "https://api.example.com/issues"

    connector, secrets = repo.created[0]
    assert "key-123" not in repr(connector.contract)
    assert {s.field_name: c.decrypt(s.ciphertext) for s in secrets} == {
        "xApiKey": "key-123",
        "authorizationHeader": "Bearer abc",
    }


async def test_connector_without_credentials_needs_no_key() -> None:
    repo = RecordingRepository()
    body = {k: v for k, v in HTTP.items() if k != "credentials"}
    result = await ConnectorService(repo).create_connector("sso-me", body, caller=ME, cipher=None)
    assert "credentials" not in result.contract
    assert repo.created[0][1] == []


async def test_credentials_without_key_are_refused() -> None:
    repo = RecordingRepository()
    with pytest.raises(AppError) as exc:
        await ConnectorService(repo).create_connector("sso-me", HTTP, caller=ME, cipher=None)
    assert exc.value.status_code == 503
    assert exc.value.code == "secret_storage_unavailable"
    assert repo.created == []


async def test_forbidden_for_another_user() -> None:
    repo = RecordingRepository()
    with pytest.raises(ForbiddenError):
        await ConnectorService(repo).create_connector("sso-them", HTTP, caller=ME, cipher=cipher())
    assert repo.created == []


async def test_duplicate_name_is_a_conflict() -> None:
    with pytest.raises(AppError) as exc:
        await ConnectorService(RecordingRepository(name_taken=True)).create_connector(
            "sso-me", HTTP, caller=ME, cipher=cipher()
        )
    assert exc.value.status_code == 409
    assert exc.value.code == "connector_name_taken"


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({**HTTP, "config": {"method": "GET", "URL": "http://10.0.0.1/"}}, "config.URL"),
        ({**HTTP, "type": "ftp"}, "type"),
        ({k: v for k, v in HTTP.items() if k != "type"}, "type"),
        (
            {"type": "mcp", "contractVersion": 1, "name": "x", "config": {"URL": "http://localhost/"}},
            "config.URL",
        ),
    ],
)
async def test_invalid_contracts_report_clean_field_paths(body: dict[str, Any], field: str) -> None:
    with pytest.raises(AppError) as exc:
        await ConnectorService(RecordingRepository()).create_connector(
            "sso-me", body, caller=ME, cipher=cipher()
        )
    assert exc.value.status_code == 422
    assert exc.value.code == "invalid_connector"
    assert field in [e["field"] for e in exc.value.details["errors"]]


async def test_error_details_never_echo_credentials() -> None:
    body = {**HTTP, "credentials": {"xApiKey": "s" * 5000}}
    with pytest.raises(AppError) as exc:
        await ConnectorService(RecordingRepository()).create_connector(
            "sso-me", body, caller=ME, cipher=cipher()
        )
    assert "sss" not in repr(exc.value.details)


async def test_list_is_owner_scoped_and_page_size_bounded() -> None:
    repo = RecordingRepository()
    items, total, page, page_size = await ConnectorService(repo).list_connectors(
        "sso-me", page=2, page_size=500, caller=ME, settings=Settings(app_env="test")
    )
    assert (items, total, page) == ([], 0, 2)
    assert page_size == Settings(app_env="test").max_page_size
    assert repo.listed == [("sso-me", 2, page_size)]

    with pytest.raises(ForbiddenError):
        await ConnectorService(repo).list_connectors(
            "sso-them", page=1, page_size=20, caller=ME, settings=Settings(app_env="test")
        )


class ToolsRepository(RecordingRepository):
    def __init__(self, items: list | None = None) -> None:
        super().__init__()
        self.items = items or []

    async def get_with_secrets(
        self, owner_user_sso: str, ids: Collection[uuid.UUID]
    ) -> list:
        return [
            item
            for item in self.items
            if item.connector.owner_user_sso == owner_user_sso
            and item.connector.id in set(ids)
        ]


def _mcp_loaded(cipher: SecretCipher | None = None) -> tuple:
    from app.domains.connectors.repository import ConnectorWithSecrets

    connector = Connector(
        id=uuid.uuid4(),
        owner_user_sso="sso-me",
        type="mcp",
        name="linear",
        contract={
            "type": "mcp",
            "name": "linear",
            "config": {"URL": "https://mcp.example.com/mcp"},
            "options": {"timeout": 4000},
        },
    )
    ciphertexts: dict[str, str] = {}
    if cipher is not None:
        ciphertexts = {"authorizationHeader": cipher.encrypt("Bearer tok")}
    return ConnectorWithSecrets(connector, ciphertexts)


async def test_lists_mcp_tools_from_the_server() -> None:
    from app.domains.connectors.repository import ConnectorWithSecrets

    key = cipher()
    loaded = _mcp_loaded(key)
    seen: dict[str, object] = {}

    async def list_tools(url: str, headers: dict[str, str], timeout_s: float) -> list[str]:
        seen["url"] = url
        seen["headers"] = headers
        seen["timeout_s"] = timeout_s
        return ["list_issues", "create_issue"]

    result = await ConnectorService(ToolsRepository([loaded])).list_connector_tools(
        "sso-me",
        loaded.connector.id,
        caller=ME,
        cipher=key,
        list_tools=list_tools,
    )
    assert result.type == "mcp"
    assert result.tools == ["list_issues", "create_issue"]
    assert seen["url"] == "https://mcp.example.com/mcp"
    assert seen["headers"]["Authorization"] == "Bearer tok"
    assert seen["timeout_s"] == 4.0
    assert "tok" not in repr(result.model_dump())
    _ = ConnectorWithSecrets


async def test_tool_preview_rejects_non_mcp_connectors() -> None:
    from app.domains.connectors.repository import ConnectorWithSecrets

    connector = Connector(
        id=uuid.uuid4(),
        owner_user_sso="sso-me",
        type="http",
        name="status",
        contract={"type": "http", "name": "status", "config": {"method": "GET", "URL": "https://status.example.com"}},
    )
    loaded = ConnectorWithSecrets(connector, {})

    async def fail(*_a: object, **_k: object) -> list[str]:
        raise AssertionError("list_tools should not be called")

    with pytest.raises(AppError) as exc:
        await ConnectorService(ToolsRepository([loaded])).list_connector_tools(
            "sso-me", connector.id, caller=ME, cipher=None, list_tools=fail
        )
    assert exc.value.status_code == 422
    assert exc.value.code == "connector_not_mcp"


async def test_tool_preview_missing_connector_is_not_found() -> None:
    async def fail(*_a: object, **_k: object) -> list[str]:
        raise AssertionError("list_tools should not be called")

    with pytest.raises(AppError) as exc:
        await ConnectorService(ToolsRepository()).list_connector_tools(
            "sso-me", uuid.uuid4(), caller=ME, cipher=None, list_tools=fail
        )
    assert exc.value.status_code == 404


async def test_tool_preview_maps_mcp_errors() -> None:
    from app.worker.bundle import BundleBuildError

    loaded = _mcp_loaded()

    async def boom(*_a: object, **_k: object) -> list[str]:
        raise BundleBuildError("mcp_unavailable", "MCP server could not be reached")

    with pytest.raises(AppError) as exc:
        await ConnectorService(ToolsRepository([loaded])).list_connector_tools(
            "sso-me", loaded.connector.id, caller=ME, cipher=None, list_tools=boom
        )
    assert exc.value.status_code == 502
    assert exc.value.code == "mcp_unavailable"


# ---------------------------------------------------------------------------
# delete_connector
# ---------------------------------------------------------------------------


class DeletingRepository(RecordingRepository):
    """Extends RecordingRepository to support delete_owned and tracks detach calls."""

    def __init__(self, *, exists: bool = True) -> None:
        super().__init__()
        self.deleted: list[uuid.UUID] = []
        self.exists = exists

    async def delete_owned(self, owner_user_sso: str, connector_id: uuid.UUID) -> bool:
        if not self.exists:
            return False
        self.deleted.append(connector_id)
        return True


class TrackingAgentRepository:
    def __init__(self) -> None:
        self.detached: list[tuple[str, uuid.UUID]] = []

    async def detach_connector(self, owner_user_sso: str, connector_id: uuid.UUID) -> int:
        self.detached.append((owner_user_sso, connector_id))
        return 1

    # Stub out the rest of the protocol
    async def list_by_owner(self, *_a: object, **_k: object) -> tuple[list, int]:
        return [], 0

    async def create(self, agent: object) -> object:
        return agent

    async def get_owned(self, *_a: object, **_k: object) -> None:
        return None

    async def save(self, agent: object) -> object:
        return agent


async def test_delete_connector_calls_detach_then_delete() -> None:
    repo = DeletingRepository()
    agents = TrackingAgentRepository()
    connector_id = uuid.uuid4()
    await ConnectorService(repo, agents).delete_connector("sso-me", connector_id, caller=ME)

    assert agents.detached == [("sso-me", connector_id)]
    assert repo.deleted == [connector_id]


async def test_delete_connector_forbidden_for_another_user() -> None:
    repo = DeletingRepository()
    agents = TrackingAgentRepository()
    with pytest.raises(ForbiddenError):
        await ConnectorService(repo, agents).delete_connector(
            "sso-them", uuid.uuid4(), caller=ME
        )
    assert agents.detached == []
    assert repo.deleted == []


async def test_delete_connector_not_found_raises_not_found() -> None:
    repo = DeletingRepository(exists=False)
    agents = TrackingAgentRepository()
    with pytest.raises(AppError) as exc:
        await ConnectorService(repo, agents).delete_connector(
            "sso-me", uuid.uuid4(), caller=ME
        )
    assert exc.value.status_code == 404
