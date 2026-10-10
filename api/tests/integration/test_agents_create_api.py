from collections.abc import Iterator
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.secrets import SecretCipher
from app.domains.agents.configurations import SECRET_PLACEHOLDER
from app.domains.agents.models import Agent, AgentSecret

OWNER = "sso-user-a"
AUTH = {"X-Dev-User-SSO": OWNER}


@pytest.fixture
def encryption_key(monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    key = SecretCipher.generate_key()
    monkeypatch.setenv("SECRETS_ENCRYPTION_KEY", key)
    get_settings.cache_clear()
    yield key
    get_settings.cache_clear()


@pytest.fixture
def no_encryption_key(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.delenv("SECRETS_ENCRYPTION_KEY", raising=False)
    # An api/.env file could still provide a key; force it off for this test.
    monkeypatch.setenv("SECRETS_ENCRYPTION_KEY", "")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def create_body(**configurations: Any) -> dict[str, Any]:
    return {
        "agentTitle": "Weekday GitHub digest",
        "systemPrompt": "Summarize yesterday's new issues.",
        "configurations": {
            "primitives": {
                "list_issues": {
                    "contractVersion": 1,
                    "method": "GET",
                    "URL": "https://api.github.com/repos/acme/web/issues",
                    "options": {"retries": 3, "timeout": 10000},
                }
            },
            "dayOfWeek": [1, 2, 3, 4, 5],
            "timeOfDay": [540],
            **configurations,
        },
    }


SECRET_CONTRACT = {
    "contractVersion": 1,
    "method": "POST",
    "URL": "https://hooks.example.com/notify",
    "payload": {"text": "digest ready"},
    "xApiKey": "key-live-123",
    "authorizationHeader": "Bearer tok-456",
}


async def test_create_returns_201_envelope(client: AsyncClient) -> None:
    response = await client.post(f"/api/v1/agents/{OWNER}", json=create_body(), headers=AUTH)

    assert response.status_code == 201, response.text
    body = response.json()
    assert set(body) == {"data", "error", "metadata", "pagination"}
    assert body["error"] is None and body["pagination"] is None
    assert body["metadata"]["request_id"]
    agent = body["data"]
    assert agent["title"] == "Weekday GitHub digest"
    assert agent["system_prompt"] == "Summarize yesterday's new issues."
    assert agent["owner_user_sso"] == OWNER
    assert agent["configurations"]["dayOfWeek"] == [1, 2, 3, 4, 5]
    assert agent["configurations"]["primitives"]["list_issues"]["method"] == "GET"
    assert agent["id"] and agent["created_at"]


async def test_created_agent_is_listed(client: AsyncClient) -> None:
    created = await client.post(f"/api/v1/agents/{OWNER}", json=create_body(), headers=AUTH)
    listed = await client.get(f"/api/v1/agents/{OWNER}", headers=AUTH)

    ids = [item["id"] for item in listed.json()["data"]]
    assert created.json()["data"]["id"] in ids


async def test_credentials_are_masked_in_responses_and_encrypted_at_rest(
    client: AsyncClient, db_session: AsyncSession, encryption_key: str
) -> None:
    body = create_body(primitives={"notify": SECRET_CONTRACT})

    created = await client.post(f"/api/v1/agents/{OWNER}", json=body, headers=AUTH)
    listed = await client.get(f"/api/v1/agents/{OWNER}", headers=AUTH)

    assert created.status_code == 201, created.text
    for response in (created, listed):
        assert "key-live-123" not in response.text
        assert "tok-456" not in response.text
    notify = created.json()["data"]["configurations"]["primitives"]["notify"]
    assert notify["xApiKey"] == SECRET_PLACEHOLDER
    assert notify["authorizationHeader"] == SECRET_PLACEHOLDER

    agent_id = created.json()["data"]["id"]
    stored = (await db_session.execute(select(Agent).where(Agent.id == agent_id))).scalar_one()
    assert "key-live-123" not in repr(stored.configurations)

    rows = (
        (await db_session.execute(select(AgentSecret).where(AgentSecret.agent_id == agent_id)))
        .scalars()
        .all()
    )
    cipher = SecretCipher(encryption_key)
    decrypted = {(r.primitive_name, r.field_name): cipher.decrypt(r.ciphertext) for r in rows}
    assert decrypted == {
        ("notify", "xApiKey"): "key-live-123",
        ("notify", "authorizationHeader"): "Bearer tok-456",
    }
    assert all("key-live-123" not in r.ciphertext for r in rows)


async def test_credentials_without_key_return_503_and_store_nothing(
    client: AsyncClient, db_session: AsyncSession, no_encryption_key: None
) -> None:
    body = create_body(primitives={"notify": SECRET_CONTRACT})
    response = await client.post(f"/api/v1/agents/{OWNER}", json=body, headers=AUTH)

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "secret_storage_unavailable"
    count = (await db_session.execute(select(Agent))).scalars().all()
    assert count == []


async def test_cross_tenant_create_is_forbidden(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    response = await client.post(
        f"/api/v1/agents/{OWNER}",
        json=create_body(),
        headers={"X-Dev-User-SSO": "sso-user-b"},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"
    assert (await db_session.execute(select(Agent))).scalars().all() == []


async def test_create_requires_authentication(client: AsyncClient) -> None:
    response = await client.post(f"/api/v1/agents/{OWNER}", json=create_body())
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


async def test_unsafe_contract_returns_422_with_field_path(client: AsyncClient) -> None:
    bad = {"contractVersion": 1, "method": "GET", "URL": "http://169.254.169.254/latest/meta-data"}
    response = await client.post(
        f"/api/v1/agents/{OWNER}", json=create_body(primitives={"meta": bad}), headers=AUTH
    )

    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "invalid_configuration"
    fields = [e["field"] for e in error["details"]["errors"]]
    assert "configurations.primitives.meta.URL" in fields


async def test_invalid_schedule_returns_422(client: AsyncClient) -> None:
    response = await client.post(
        f"/api/v1/agents/{OWNER}", json=create_body(timeOfDay=[1440]), headers=AUTH
    )
    assert response.status_code == 422
    fields = [e["field"] for e in response.json()["error"]["details"]["errors"]]
    assert any(f.startswith("configurations.timeOfDay") for f in fields)


async def test_missing_title_returns_422_envelope(client: AsyncClient) -> None:
    body = create_body()
    del body["agentTitle"]
    response = await client.post(f"/api/v1/agents/{OWNER}", json=body, headers=AUTH)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_spec_typo_agent_tile_is_accepted(client: AsyncClient) -> None:
    body = create_body()
    body["agentTile"] = body.pop("agentTitle")
    response = await client.post(f"/api/v1/agents/{OWNER}", json=body, headers=AUTH)
    assert response.status_code == 201
    assert response.json()["data"]["title"] == "Weekday GitHub digest"
