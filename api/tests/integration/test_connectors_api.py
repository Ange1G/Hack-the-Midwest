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


async def test_connector_types_catalog(client: AsyncClient) -> None:
    response = await client.get("/api/v1/connector-types", headers=AUTH)
    assert response.status_code == 200
    types = {item["type"]: item for item in response.json()["data"]}
    assert set(types) == {"http", "mcp", "database"}
    assert types["mcp"]["credential_fields"] == ["xApiKey", "authorizationHeader"]
    assert "config" in types["mcp"]["config_schema"]["required"]
    assert (await client.get("/api/v1/connector-types")).status_code == 401
