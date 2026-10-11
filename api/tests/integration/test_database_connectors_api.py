import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.secrets import SecretCipher
from app.domains.agents.models import Agent
from app.domains.connectors.models import Connector, ConnectorSecret
from app.domains.connectors.repository import SqlAlchemyConnectorRepository
from app.domains.primitives.base import SECRET_PLACEHOLDER
from app.runtime.agent_databases import agent_databases
from app.runtime.database_provisioner import ProvisionedDatabase, ProvisionRequest

OWNER = "sso-user-a"
AUTH = {"X-Dev-User-SSO": OWNER}
OTHER = {"X-Dev-User-SSO": "sso-user-b"}
CONNECTORS_URL = f"/api/v1/connectors/{OWNER}"
AGENTS_URL = f"/api/v1/agents/{OWNER}"

EXTERNAL = {
    "type": "database",
    "contractVersion": 1,
    "name": "orders_db",
    "description": "Orders read replica",
    "credentials": {"username": "agent_reader", "password": "db-secret-456"},
    "config": {
        "mode": "external",
        "engine": "postgres",
        "host": "db.example.com",
        "database": "orders",
    },
}
PROVISIONED = {
    "type": "database",
    "contractVersion": 1,
    "name": "scratch",
    "config": {"mode": "provisioned", "engine": "postgres", "lifecycle": "run"},
}


@pytest.fixture
def encryption_key(monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    key = SecretCipher.generate_key()
    monkeypatch.setenv("SECRETS_ENCRYPTION_KEY", key)
    get_settings.cache_clear()
    yield key
    get_settings.cache_clear()


@pytest.fixture
def no_encryption_key(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("SECRETS_ENCRYPTION_KEY", "")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


async def create(client: AsyncClient, body: dict[str, Any], headers: dict[str, str] = AUTH):
    sso = headers["X-Dev-User-SSO"]
    return await client.post(f"/api/v1/connectors/{sso}", json=body, headers=headers)


async def test_external_database_credentials_are_encrypted_and_masked(
    client: AsyncClient, db_session: AsyncSession, encryption_key: str
) -> None:
    response = await create(client, EXTERNAL)

    assert response.status_code == 201, response.text
    connector = response.json()["data"]
    assert connector["type"] == "database"
    assert connector["contract"]["credentials"] == {
        "username": SECRET_PLACEHOLDER,
        "password": SECRET_PLACEHOLDER,
    }
    assert connector["contract"]["config"] == {
        "mode": "external",
        "engine": "postgres",
        "host": "db.example.com",
        "port": 5432,
        "database": "orders",
        "tls": "verifyFull",
        "access": "readOnly",
    }
    assert "db-secret-456" not in response.text and "agent_reader" not in response.text

    rows = (
        (
            await db_session.execute(
                select(ConnectorSecret).where(ConnectorSecret.connector_id == connector["id"])
            )
        )
        .scalars()
        .all()
    )
    cipher = SecretCipher(encryption_key)
    assert {r.field_name: cipher.decrypt(r.ciphertext) for r in rows} == {
        "username": "agent_reader",
        "password": "db-secret-456",
    }


async def test_provisioned_database_needs_no_credentials_or_key(
    client: AsyncClient, no_encryption_key: None
) -> None:
    response = await create(client, PROVISIONED)
    assert response.status_code == 201, response.text
    config = response.json()["data"]["contract"]["config"]
    assert config["version"] == "16" and config["database"] == "agent"
    assert "credentials" not in response.json()["data"]["contract"]


async def test_supplied_credentials_without_a_key_return_503(
    client: AsyncClient, no_encryption_key: None
) -> None:
    body = {**PROVISIONED, "credentials": {"password": "long-enough-password"}}
    response = await create(client, body)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "secret_storage_unavailable"


@pytest.mark.parametrize(
    ("config", "field"),
    [
        ({**EXTERNAL["config"], "host": "169.254.169.254"}, "config.host"),
        ({**EXTERNAL["config"], "tls": "disable"}, "config.tls"),
        ({**EXTERNAL["config"], "database": None}, "config"),
        ({**PROVISIONED["config"], "version": "9"}, "config"),
        ({**PROVISIONED["config"], "database": "Bad Name"}, "config.database"),
    ],
)
async def test_invalid_database_contracts_return_422_with_field_paths(
    client: AsyncClient, encryption_key: str, config: dict[str, Any], field: str
) -> None:
    body = {**(EXTERNAL if config["mode"] == "external" else PROVISIONED), "config": config}
    response = await create(client, body)
    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "invalid_connector"
    assert field in [e["field"] for e in error["details"]["errors"]]
    assert "db-secret-456" not in response.text


async def test_agents_reference_database_connectors(
    client: AsyncClient, encryption_key: str
) -> None:
    db_id = (await create(client, EXTERNAL)).json()["data"]["id"]
    body = {
        "agentTitle": "Order analyst",
        "systemPrompt": "Answer order questions.",
        "configurations": {"primitives": {db_id: {}}},
    }
    response = await client.post(AGENTS_URL, json=body, headers=AUTH)
    assert response.status_code == 201, response.text
    assert response.json()["data"]["configurations"]["primitives"] == {db_id: {}}

    with_tools = {**body, "configurations": {"primitives": {db_id: {"allowedTools": ["x"]}}}}
    rejected = await client.post(AGENTS_URL, json=with_tools, headers=AUTH)
    assert rejected.status_code == 422
    assert "only to MCP" in rejected.text


async def test_catalog_includes_database(client: AsyncClient) -> None:
    response = await client.get("/api/v1/connector-types", headers=AUTH)
    entry = next(c for c in response.json()["data"] if c["type"] == "database")
    assert entry["credential_fields"] == ["username", "password"]


class RecordingProvisioner:
    def __init__(self) -> None:
        self.started: list[ProvisionRequest] = []
        self.released: list[ProvisionedDatabase] = []

    async def start(self, request: ProvisionRequest) -> ProvisionedDatabase:
        self.started.append(request)
        return ProvisionedDatabase("cdb-test", "127.0.0.1", 49999, request.lifecycle)

    async def release(self, database: ProvisionedDatabase) -> None:
        self.released.append(database)


async def test_run_start_loads_owner_connectors_from_the_database(
    client: AsyncClient, db_session: AsyncSession, encryption_key: str
) -> None:
    external_id = (await create(client, EXTERNAL)).json()["data"]["id"]
    scratch_id = (await create(client, PROVISIONED)).json()["data"]["id"]
    theirs = (await create(client, {**PROVISIONED, "name": "theirs"}, OTHER)).json()["data"]["id"]
    agent = Agent(
        title="Analyst",
        system_prompt="",
        # A reference to another user's connector cannot be saved through the API; it is
        # written directly here to show the run-time load is owner-scoped as well.
        configurations={"primitives": {external_id: {}, scratch_id: {}, theirs: {}}},
        owner_user_sso=OWNER,
    )
    db_session.add(agent)
    await db_session.commit()

    async def public(host: str, port: int) -> list[str]:
        return ["198.51.100.7"]

    provisioner = RecordingProvisioner()
    async with agent_databases(
        agent,
        connectors=SqlAlchemyConnectorRepository(db_session),
        cipher=SecretCipher(encryption_key),
        provisioner=provisioner,
        resolve=public,
    ) as dbs:
        assert set(dbs) == {"orders_db", "scratch"}
        assert dbs["orders_db"].password == "db-secret-456"
        assert dbs["scratch"].port == 49999
    assert [r.connector_id for r in provisioner.started] == [uuid.UUID(scratch_id)]
    assert len(provisioner.released) == 1

    await db_session.delete(agent)
    await db_session.commit()
    assert (await db_session.execute(select(Connector))).scalars().all()  # untouched
