from collections.abc import Iterator

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.secrets import SecretCipher
from app.domains.agents.models import Agent
from app.domains.executions.models import AgentExecution
from app.domains.primitives.base import SECRET_PLACEHOLDER
from app.domains.webhooks.models import Webhook
from app.domains.webhooks.rate_limit import webhook_rate_limiter
from app.domains.webhooks.signature import signature_header

OWNER = "sso-user-a"
AUTH = {"X-Dev-User-SSO": OWNER}
OTHER = {"X-Dev-User-SSO": "sso-user-b"}
CRUD = f"/api/v1/webhooks/{OWNER}"


@pytest.fixture
def encryption_key(monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    key = SecretCipher.generate_key()
    monkeypatch.setenv("SECRETS_ENCRYPTION_KEY", key)
    get_settings.cache_clear()
    yield key
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _reset_rate_limiter() -> Iterator[None]:
    webhook_rate_limiter.reset()
    yield
    webhook_rate_limiter.reset()


async def _create_agent(db_session: AsyncSession) -> Agent:
    agent = Agent(
        title="Digest",
        system_prompt="Summarize",
        configurations={"primitives": {}},
        owner_user_sso=OWNER,
    )
    db_session.add(agent)
    await db_session.commit()
    await db_session.refresh(agent)
    return agent


async def _create_webhook(client: AsyncClient, agent_id: object) -> dict:
    response = await client.post(
        CRUD, headers=AUTH, json={"target_agent_id": str(agent_id)}
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


async def test_create_webhook_returns_secret_once(
    client: AsyncClient, db_session: AsyncSession, encryption_key: str
) -> None:
    agent = await _create_agent(db_session)
    created = await _create_webhook(client, agent.id)
    assert created["target_agent_id"] == str(agent.id)
    assert created["owner_user_sso"] == OWNER
    assert created["secret"] and created["secret"] != SECRET_PLACEHOLDER
    assert created["disabled"] is False

    listed = await client.get(CRUD, headers=AUTH)
    assert listed.status_code == 200
    assert listed.json()["data"][0]["secret"] == SECRET_PLACEHOLDER
    assert created["secret"] not in listed.text

    stored = (
        await db_session.execute(select(Webhook).where(Webhook.id == created["id"]))
    ).scalar_one()
    assert stored.secret_ciphertext != created["secret"]
    assert created["secret"] not in stored.secret_ciphertext


async def test_fire_enqueues_queued_execution_with_body_input(
    client: AsyncClient, db_session: AsyncSession, encryption_key: str
) -> None:
    agent = await _create_agent(db_session)
    created = await _create_webhook(client, agent.id)
    body = b'{\n  "ticket": "INC-1"\n}'
    fired = await client.post(
        f"/api/v1/hooks/{created['id']}",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature_header(created["secret"], body),
        },
    )
    assert fired.status_code == 202, fired.text
    data = fired.json()["data"]
    assert data["status"] == "queued"
    assert data["agent_id"] == str(agent.id)
    assert data["input"] == '{"ticket":"INC-1"}'
    assert data["id"]

    row = (
        await db_session.execute(
            select(AgentExecution).where(AgentExecution.id == data["id"])
        )
    ).scalar_one()
    assert row.input == '{"ticket":"INC-1"}'
    assert row.owner_user_sso == OWNER


async def test_fire_invalid_signature_returns_401_and_creates_no_execution(
    client: AsyncClient, db_session: AsyncSession, encryption_key: str
) -> None:
    agent = await _create_agent(db_session)
    created = await _create_webhook(client, agent.id)
    body = b'{"ticket":"INC-1"}'
    fired = await client.post(
        f"/api/v1/hooks/{created['id']}",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature_header("wrong-secret", body),
        },
    )
    assert fired.status_code == 401
    assert fired.json()["error"]["code"] == "unauthorized"
    count = (await db_session.execute(select(AgentExecution))).scalars().all()
    assert count == []


async def test_fire_deleted_agent_returns_404(
    client: AsyncClient, db_session: AsyncSession, encryption_key: str
) -> None:
    agent = await _create_agent(db_session)
    created = await _create_webhook(client, agent.id)
    secret = created["secret"]
    webhook_id = created["id"]
    await db_session.delete(agent)
    await db_session.commit()

    body = b'{"ticket":"INC-1"}'
    fired = await client.post(
        f"/api/v1/hooks/{webhook_id}",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature_header(secret, body),
        },
    )
    assert fired.status_code == 404
    assert (await db_session.execute(select(AgentExecution))).scalars().all() == []


async def test_create_without_sso_is_unauthorized(
    client: AsyncClient, db_session: AsyncSession, encryption_key: str
) -> None:
    agent = await _create_agent(db_session)
    response = await client.post(
        CRUD, json={"target_agent_id": str(agent.id)}
    )
    assert response.status_code == 401


async def test_cross_tenant_create_is_forbidden(
    client: AsyncClient, db_session: AsyncSession, encryption_key: str
) -> None:
    agent = await _create_agent(db_session)
    response = await client.post(
        CRUD, headers=OTHER, json={"target_agent_id": str(agent.id)}
    )
    assert response.status_code == 403


async def test_delete_webhook_then_fire_is_404(
    client: AsyncClient, db_session: AsyncSession, encryption_key: str
) -> None:
    agent = await _create_agent(db_session)
    created = await _create_webhook(client, agent.id)
    deleted = await client.delete(f"{CRUD}/{created['id']}", headers=AUTH)
    assert deleted.status_code == 204
    body = b'{"ok":true}'
    fired = await client.post(
        f"/api/v1/hooks/{created['id']}",
        content=body,
        headers={"X-Webhook-Signature": signature_header(created["secret"], body)},
    )
    assert fired.status_code == 404


async def test_fire_oversized_body_returns_413(
    client: AsyncClient, db_session: AsyncSession, encryption_key: str
) -> None:
    agent = await _create_agent(db_session)
    created = await _create_webhook(client, agent.id)
    body = b"x" * 20_001
    fired = await client.post(
        f"/api/v1/hooks/{created['id']}",
        content=body,
        headers={"X-Webhook-Signature": signature_header(created["secret"], body)},
    )
    assert fired.status_code == 413
    assert (await db_session.execute(select(AgentExecution))).scalars().all() == []
