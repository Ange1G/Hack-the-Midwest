from collections.abc import Iterator

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.secrets import SecretCipher
from app.domains.connectors.models import ConnectorSecret
from app.domains.primitives.base import SECRET_PLACEHOLDER

OWNER = "sso-user-a"
AUTH = {"X-Dev-User-SSO": OWNER}
OTHER = {"X-Dev-User-SSO": "sso-user-b"}


@pytest.fixture
def encryption_key(monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    key = SecretCipher.generate_key()
    monkeypatch.setenv("SECRETS_ENCRYPTION_KEY", key)
    get_settings.cache_clear()
    yield key
    get_settings.cache_clear()


async def test_lists_catalog_and_templates(client: AsyncClient) -> None:
    integrations = await client.get("/api/v1/integrations", headers=AUTH)
    assert integrations.status_code == 200
    ids = [item["id"] for item in integrations.json()["data"]]
    assert ids == ["exa", "agenty", "agentql"]

    templates = await client.get("/api/v1/agent-templates", headers=AUTH)
    assert templates.status_code == 200
    assert {t["id"] for t in templates.json()["data"]} == {
        "research_assistant",
        "web_data_extractor",
        "page_watcher",
    }


async def test_catalog_requires_authentication(client: AsyncClient) -> None:
    response = await client.get("/api/v1/integrations")
    assert response.status_code == 401


async def test_install_creates_owned_connector_with_encrypted_masked_key(
    client: AsyncClient, db_session: AsyncSession, encryption_key: str
) -> None:
    response = await client.post(
        f"/api/v1/integrations/{OWNER}/agenty/install",
        json={"apiKey": "agenty-live-key"},
        headers=AUTH,
    )
    assert response.status_code == 201, response.text
    connector = response.json()["data"]
    assert connector["type"] == "mcp"
    assert connector["name"] == "agenty"
    assert connector["owner_user_sso"] == OWNER
    assert connector["contract"]["credentials"] == {
        "authorizationHeader": SECRET_PLACEHOLDER
    }
    assert "agenty-live-key" not in response.text

    secret = (
        await db_session.execute(
            select(ConnectorSecret).where(ConnectorSecret.connector_id == connector["id"])
        )
    ).scalar_one()
    plaintext = SecretCipher(encryption_key).decrypt(secret.ciphertext)
    assert plaintext == "Bearer agenty-live-key"


async def test_install_without_key_for_optional_integration(client: AsyncClient) -> None:
    response = await client.post(
        f"/api/v1/integrations/{OWNER}/exa/install", headers=AUTH
    )
    assert response.status_code == 201, response.text
    assert "credentials" not in response.json()["data"]["contract"]


async def test_install_errors(client: AsyncClient, encryption_key: str) -> None:
    missing_key = await client.post(
        f"/api/v1/integrations/{OWNER}/agentql/install", json={}, headers=AUTH
    )
    assert missing_key.status_code == 422
    assert missing_key.json()["error"]["code"] == "api_key_required"

    unknown = await client.post(
        f"/api/v1/integrations/{OWNER}/nope/install", json={}, headers=AUTH
    )
    assert unknown.status_code == 404

    first = await client.post(
        f"/api/v1/integrations/{OWNER}/exa/install", json={}, headers=AUTH
    )
    assert first.status_code == 201
    taken = await client.post(
        f"/api/v1/integrations/{OWNER}/exa/install", json={}, headers=AUTH
    )
    assert taken.status_code == 409
    renamed = await client.post(
        f"/api/v1/integrations/{OWNER}/exa/install",
        json={"name": "exa_second"},
        headers=AUTH,
    )
    assert renamed.status_code == 201
    assert renamed.json()["data"]["name"] == "exa_second"


async def test_install_for_another_user_is_forbidden(client: AsyncClient) -> None:
    response = await client.post(
        f"/api/v1/integrations/{OWNER}/exa/install", json={}, headers=OTHER
    )
    assert response.status_code == 403
