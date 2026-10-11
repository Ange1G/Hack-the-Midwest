import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.agents.models import Agent
from app.domains.executions.models import AgentExecution, ExecutionStatus
from app.domains.executions.tokens import hash_callback_token

OWNER = "sso-user-a"
AUTH = {"X-Dev-User-SSO": OWNER}
OTHER = {"X-Dev-User-SSO": "sso-user-b"}


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


async def test_enqueue_returns_202_queued(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _create_agent(db_session)
    response = await client.post(
        f"/api/v1/agents/{OWNER}/{agent.id}/executions", headers=AUTH
    )
    assert response.status_code == 202, response.text
    body = response.json()
    assert body["error"] is None
    assert body["data"]["status"] == "queued"
    assert body["data"]["agent_id"] == str(agent.id)
    assert body["data"]["result"] is None


async def test_enqueue_and_get_round_trip(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _create_agent(db_session)
    created = await client.post(
        f"/api/v1/agents/{OWNER}/{agent.id}/executions", headers=AUTH
    )
    execution_id = created.json()["data"]["id"]
    fetched = await client.get(
        f"/api/v1/agents/{OWNER}/executions/{execution_id}", headers=AUTH
    )
    assert fetched.status_code == 200
    assert fetched.json()["data"]["id"] == execution_id
    listed = await client.get(f"/api/v1/agents/{OWNER}/executions", headers=AUTH)
    ids = [item["id"] for item in listed.json()["data"]]
    assert execution_id in ids


async def test_cross_tenant_enqueue_and_get_are_forbidden(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _create_agent(db_session)
    enqueue = await client.post(
        f"/api/v1/agents/{OWNER}/{agent.id}/executions", headers=OTHER
    )
    assert enqueue.status_code == 403
    created = await client.post(
        f"/api/v1/agents/{OWNER}/{agent.id}/executions", headers=AUTH
    )
    execution_id = created.json()["data"]["id"]
    fetched = await client.get(
        f"/api/v1/agents/{OWNER}/executions/{execution_id}", headers=OTHER
    )
    assert fetched.status_code == 403


async def test_missing_agent_returns_404(client: AsyncClient) -> None:
    response = await client.post(
        f"/api/v1/agents/{OWNER}/{uuid.uuid4()}/executions", headers=AUTH
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_callback_without_token_is_unauthorized(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _create_agent(db_session)
    execution = AgentExecution(
        agent_id=agent.id,
        owner_user_sso=OWNER,
        status=ExecutionStatus.RUNNING.value,
        callback_token_hash=hash_callback_token("secret"),
    )
    db_session.add(execution)
    await db_session.commit()
    await db_session.refresh(execution)

    missing = await client.post(
        f"/api/v1/internal/executions/{execution.id}/complete",
        json={"status": "succeeded", "result": {"ok": True}},
    )
    assert missing.status_code == 401
    wrong = await client.post(
        f"/api/v1/internal/executions/{execution.id}/complete",
        json={"status": "succeeded", "result": {"ok": True}},
        headers={"X-Execution-Callback-Token": "nope"},
    )
    assert wrong.status_code == 401


async def test_callback_completes_and_is_idempotent(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _create_agent(db_session)
    execution = AgentExecution(
        agent_id=agent.id,
        owner_user_sso=OWNER,
        status=ExecutionStatus.RUNNING.value,
        callback_token_hash=hash_callback_token("secret"),
    )
    db_session.add(execution)
    await db_session.commit()
    await db_session.refresh(execution)

    first = await client.post(
        f"/api/v1/internal/executions/{execution.id}/complete",
        json={"status": "succeeded", "result": {"message": "stub run complete"}},
        headers={"X-Execution-Callback-Token": "secret"},
    )
    assert first.status_code == 200, first.text
    assert first.json()["data"]["status"] == "succeeded"
    assert first.json()["data"]["result"] == {"message": "stub run complete"}

    second = await client.post(
        f"/api/v1/internal/executions/{execution.id}/complete",
        json={"status": "failed", "error": {"code": "x", "message": "ignored"}},
        headers={"X-Execution-Callback-Token": "secret"},
    )
    assert second.status_code == 200
    assert second.json()["data"]["status"] == "succeeded"
    assert second.json()["data"]["result"] == {"message": "stub run complete"}


async def test_callback_invalid_body_returns_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _create_agent(db_session)
    execution = AgentExecution(
        agent_id=agent.id,
        owner_user_sso=OWNER,
        status=ExecutionStatus.RUNNING.value,
        callback_token_hash=hash_callback_token("secret"),
    )
    db_session.add(execution)
    await db_session.commit()
    await db_session.refresh(execution)

    response = await client.post(
        f"/api/v1/internal/executions/{execution.id}/complete",
        json={"status": "failed"},
        headers={"X-Execution-Callback-Token": "secret"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_unknown_execution_callback_is_404(client: AsyncClient) -> None:
    response = await client.post(
        f"/api/v1/internal/executions/{uuid.uuid4()}/complete",
        json={"status": "succeeded", "result": {}},
        headers={"X-Execution-Callback-Token": "secret"},
    )
    assert response.status_code == 404
