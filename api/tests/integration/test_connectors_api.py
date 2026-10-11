from collections.abc import Iterator
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.secrets import SecretCipher
from app.domains.connectors.models import Connector, ConnectorSecret
from app.domains.primitives.base import SECRET_PLACEHOLDER

OWNER = "sso-user-a"
AUTH = {"X-Dev-User-SSO": OWNER}
OTHER = {"X-Dev-User-SSO": "sso-user-b"}
URL = f"/api/v1/connectors/{OWNER}"
OTHER_URL = "/api/v1/connectors/sso-user-b"

MCP = {
    "type": "mcp",
    "contractVersion": 1,
    "name": "linear",
    "description": "Team Linear workspace",
    "options": {"retries": 2, "timeout": 15000},
    "credentials": {"authorizationHeader": "Bearer mcp-secret-789"},
    "config": {"URL": "https://mcp.linear.example.com/mcp"},
}
HTTP = {
    "type": "http",
    "contractVersion": 1,
    "name": "list_issues",
    "config": {"method": "GET", "URL": "https://api.github.com/repos/acme/web/issues"},
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
    # Empty overrides any key an api/.env file might provide.
    monkeypatch.setenv("SECRETS_ENCRYPTION_KEY", "")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


async def post(client: AsyncClient, body: dict[str, Any]):
    return await client.post(URL, json=body, headers=AUTH)


async def test_create_connector_returns_201_with_masked_credentials(
    client: AsyncClient, db_session: AsyncSession, encryption_key: str
) -> None:
    response = await post(client, MCP)

    assert response.status_code == 201, response.text
    body = response.json()
    assert set(body) == {"data", "error", "metadata", "pagination"}
    connector = body["data"]
    assert connector["type"] == "mcp" and connector["name"] == "linear"
    assert connector["owner_user_sso"] == OWNER
    assert connector["contract"]["credentials"] == {"authorizationHeader": SECRET_PLACEHOLDER}
    assert connector["contract"]["config"]["transport"] == "streamableHttp"
    assert "mcp-secret-789" not in response.text

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
        "authorizationHeader": "Bearer mcp-secret-789"
    }
    stored = (
        await db_session.execute(select(Connector).where(Connector.id == connector["id"]))
    ).scalar_one()
    assert "mcp-secret-789" not in repr(stored.contract)


SLACK_URL = "https://hooks.slack.com/services/T000/B000/slack-secret-456"
NOTIFICATION = {
    "type": "notification",
    "contractVersion": 1,
    "name": "slack_alerts",
    "credentials": {"webhookUrl": SLACK_URL},
    "config": {"bodyParams": ["text"]},
}


async def test_notification_destination_is_stored_encrypted_and_never_returned(
    client: AsyncClient, db_session: AsyncSession, encryption_key: str
) -> None:
    response = await post(client, NOTIFICATION)

    assert response.status_code == 201, response.text
    connector = response.json()["data"]
    assert connector["type"] == "notification"
    assert connector["contract"]["credentials"] == {"webhookUrl": SECRET_PLACEHOLDER}
    assert connector["contract"]["config"] == {"bodyParams": ["text"]}
    assert "slack-secret-456" not in response.text

    rows = (
        await db_session.execute(
            select(ConnectorSecret).where(ConnectorSecret.connector_id == connector["id"])
        )
    ).scalars().all()
    cipher = SecretCipher(encryption_key)
    assert {r.field_name: cipher.decrypt(r.ciphertext) for r in rows} == {
        "webhookUrl": SLACK_URL
    }
    listed = await client.get(URL, headers=AUTH)
    assert "slack-secret-456" not in listed.text


async def test_notification_with_internal_destination_is_422(client: AsyncClient) -> None:
    bad = {**NOTIFICATION, "credentials": {"webhookUrl": "http://169.254.169.254/latest"}}
    response = await post(client, bad)
    assert response.status_code == 422, response.text
    fields = [e["field"] for e in response.json()["error"]["details"]["errors"]]
    assert "credentials.webhookUrl" in fields


async def test_list_returns_only_my_connectors_paginated(
    client: AsyncClient, encryption_key: str
) -> None:
    await post(client, MCP)
    await post(client, HTTP)
    await client.post(OTHER_URL, json={**HTTP, "name": "theirs"}, headers=OTHER)

    response = await client.get(URL, headers=AUTH, params={"page": 1, "page_size": 1})
    body = response.json()
    assert response.status_code == 200
    assert body["pagination"]["total_items"] == 2
    assert body["pagination"]["total_pages"] == 2
    assert len(body["data"]) == 1

    everything = (await client.get(URL, headers=AUTH)).json()["data"]
    assert {c["name"] for c in everything} == {"linear", "list_issues"}
    assert "mcp-secret-789" not in repr(everything)


async def test_duplicate_name_for_same_user_is_409(client: AsyncClient) -> None:
    assert (await post(client, HTTP)).status_code == 201
    response = await post(client, HTTP)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "connector_name_taken"


async def test_same_name_for_different_users_is_allowed(client: AsyncClient) -> None:
    assert (await post(client, HTTP)).status_code == 201
    assert (await client.post(OTHER_URL, json=HTTP, headers=OTHER)).status_code == 201


async def test_credentials_without_key_return_503(
    client: AsyncClient, db_session: AsyncSession, no_encryption_key: None
) -> None:
    response = await post(client, MCP)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "secret_storage_unavailable"
    assert (await db_session.execute(select(Connector))).scalars().all() == []


async def test_invalid_contract_returns_422_with_field_path(client: AsyncClient) -> None:
    bad = {**HTTP, "config": {"method": "GET", "URL": "http://169.254.169.254/latest"}}
    response = await post(client, bad)
    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "invalid_connector"
    assert "config.URL" in [e["field"] for e in error["details"]["errors"]]


async def test_cross_tenant_access_is_forbidden(client: AsyncClient) -> None:
    assert (await client.post(URL, json=HTTP, headers=OTHER)).status_code == 403
    assert (await client.get(URL, headers=OTHER)).status_code == 403


async def test_requires_authentication(client: AsyncClient) -> None:
    assert (await client.post(URL, json=HTTP)).status_code == 401
    assert (await client.get(URL)).status_code == 401


async def test_mcp_tools_preview_rejects_http_and_unknown(
    client: AsyncClient,
) -> None:
    created = await post(client, HTTP)
    assert created.status_code == 201
    connector_id = created.json()["data"]["id"]
    http_preview = await client.get(f"{URL}/{connector_id}/tools", headers=AUTH)
    assert http_preview.status_code == 422
    assert http_preview.json()["error"]["code"] == "connector_not_mcp"

    missing = await client.get(
        f"{URL}/00000000-0000-0000-0000-000000000001/tools", headers=AUTH
    )
    assert missing.status_code == 404
    other = await client.get(f"{URL}/{connector_id}/tools", headers=OTHER)
    assert other.status_code == 403


async def test_connector_types_catalog(client: AsyncClient) -> None:
    response = await client.get("/api/v1/connector-types", headers=AUTH)
    assert response.status_code == 200
    types = {item["type"]: item for item in response.json()["data"]}
    assert set(types) == {"http", "mcp", "database", "knowledge", "notification"}
    assert types["mcp"]["credential_fields"] == ["xApiKey", "authorizationHeader"]
    assert "config" in types["mcp"]["config_schema"]["required"]
    assert (await client.get("/api/v1/connector-types")).status_code == 401


# ---------------------------------------------------------------------------
# DELETE connector
# ---------------------------------------------------------------------------

AGENTS_URL = f"/api/v1/agents/{OWNER}"

AGENT_BODY_BASE = {
    "title": "My agent",
    "systemPrompt": "You are helpful.",
    "configurations": {
        "primitives": {},
        "dayOfWeek": [],
        "timeOfDay": [],
    },
}


async def create_agent(client: AsyncClient, primitives: dict) -> dict:
    body = {
        **AGENT_BODY_BASE,
        "configurations": {**AGENT_BODY_BASE["configurations"], "primitives": primitives},
    }
    r = await client.post(AGENTS_URL, json=body, headers=AUTH)
    assert r.status_code == 201, r.text
    return r.json()["data"]


async def test_delete_connector_returns_204(client: AsyncClient) -> None:
    created = await post(client, HTTP)
    connector_id = created.json()["data"]["id"]

    response = await client.delete(f"{URL}/{connector_id}", headers=AUTH)
    assert response.status_code == 204
    assert response.content == b""

    listed = await client.get(URL, headers=AUTH)
    assert all(c["id"] != connector_id for c in listed.json()["data"])


async def test_delete_connector_detaches_from_agents(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    created = await post(client, HTTP)
    connector_id = created.json()["data"]["id"]

    agent = await create_agent(client, {connector_id: {}})
    assert connector_id in agent["configurations"]["primitives"]

    response = await client.delete(f"{URL}/{connector_id}", headers=AUTH)
    assert response.status_code == 204

    agent_response = await client.get(f"{AGENTS_URL}/{agent['id']}", headers=AUTH)
    updated = agent_response.json()["data"]
    assert connector_id not in updated["configurations"]["primitives"]


async def test_delete_connector_404_for_missing(client: AsyncClient) -> None:
    missing = "00000000-0000-0000-0000-000000000002"
    response = await client.delete(f"{URL}/{missing}", headers=AUTH)
    assert response.status_code == 404


async def test_delete_connector_404_for_another_tenants_connector(
    client: AsyncClient,
) -> None:
    theirs = await client.post(OTHER_URL, json={**HTTP, "name": "theirs"}, headers=OTHER)
    connector_id = theirs.json()["data"]["id"]

    response = await client.delete(f"{URL}/{connector_id}", headers=AUTH)
    assert response.status_code == 404


async def test_delete_connector_403_wrong_path_user(client: AsyncClient) -> None:
    created = await post(client, HTTP)
    connector_id = created.json()["data"]["id"]

    response = await client.delete(f"{URL}/{connector_id}", headers=OTHER)
    assert response.status_code == 403


async def test_delete_connector_401_unauthenticated(client: AsyncClient) -> None:
    created = await post(client, HTTP)
    connector_id = created.json()["data"]["id"]

    response = await client.delete(f"{URL}/{connector_id}")
    assert response.status_code == 401
