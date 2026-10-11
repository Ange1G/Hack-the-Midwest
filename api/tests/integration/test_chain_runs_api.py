import uuid

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.agents.models import Agent
from app.domains.executions.models import AgentExecution, ExecutionStatus
from app.domains.executions.tokens import hash_callback_token

OWNER = "sso-user-a"
AUTH = {"X-Dev-User-SSO": OWNER}
OTHER = {"X-Dev-User-SSO": "sso-user-b"}
CHAINS = f"/api/v1/chains/{OWNER}"


async def _create_agent(db_session: AsyncSession, title: str) -> Agent:
    agent = Agent(
        title=title,
        system_prompt="Summarize",
        configurations={"primitives": {}},
        owner_user_sso=OWNER,
    )
    db_session.add(agent)
    await db_session.commit()
    await db_session.refresh(agent)
    return agent


async def _create_chain(client: AsyncClient, *agent_ids: uuid.UUID) -> dict:
    response = await client.post(
        CHAINS,
        headers=AUTH,
        json={
            "title": "Pipeline",
            "steps": [{"agent_id": str(agent_id)} for agent_id in agent_ids],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


async def _complete(
    client: AsyncClient,
    db_session: AsyncSession,
    execution_id: uuid.UUID,
    *,
    status: str = "succeeded",
    result: dict | None = None,
    error: dict | None = None,
) -> None:
    row = (
        await db_session.execute(select(AgentExecution).where(AgentExecution.id == execution_id))
    ).scalar_one()
    row.status = ExecutionStatus.RUNNING.value
    row.callback_token_hash = hash_callback_token("secret")
    await db_session.commit()
    body: dict = {"status": status}
    if result is not None:
        body["result"] = result
    if error is not None:
        body["error"] = error
    response = await client.post(
        f"/api/v1/internal/executions/{execution_id}/complete",
        json=body,
        headers={"X-Execution-Callback-Token": "secret"},
    )
    assert response.status_code == 200, response.text


async def test_two_step_chain_handoff_and_final_result_only(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    first = await _create_agent(db_session, "A")
    second = await _create_agent(db_session, "B")
    chain = await _create_chain(client, first.id, second.id)

    started = await client.post(
        f"{CHAINS}/{chain['id']}/runs",
        headers=AUTH,
        json={"input": "ticket INC-1"},
    )
    assert started.status_code == 202, started.text
    run = started.json()["data"]
    assert run["status"] == "running"
    assert run["input"] == "ticket INC-1"
    assert run["final_result"] is None
    assert "steps" not in run

    steps = await client.get(f"{CHAINS}/runs/{run['id']}/steps", headers=AUTH)
    assert steps.status_code == 200
    first_step = steps.json()["data"][0]
    assert first_step["position"] == 0
    assert first_step["status"] == "queued"
    assert first_step["input"] == "ticket INC-1"
    await _complete(
        client,
        db_session,
        uuid.UUID(first_step["execution_id"]),
        result={"output": "summary-from-a", "tool_calls": [{"name": "http_get"}]},
    )

    mid = await client.get(f"{CHAINS}/runs/{run['id']}", headers=AUTH)
    assert mid.json()["data"]["status"] == "running"
    assert mid.json()["data"]["final_result"] is None
    assert "steps" not in mid.json()["data"]

    after_a = await client.get(f"{CHAINS}/runs/{run['id']}/steps", headers=AUTH)
    ordered = after_a.json()["data"]
    assert [step["position"] for step in ordered] == [0, 1]
    assert ordered[0]["status"] == "succeeded"
    assert ordered[0]["result"]["output"] == "summary-from-a"
    assert ordered[1]["status"] == "queued"
    assert ordered[1]["input"] is not None
    assert "summary-from-a" in ordered[1]["input"]

    await _complete(
        client,
        db_session,
        uuid.UUID(ordered[1]["execution_id"]),
        result={"output": "final-from-b"},
    )
    finished = await client.get(f"{CHAINS}/runs/{run['id']}", headers=AUTH)
    data = finished.json()["data"]
    assert data["status"] == "succeeded"
    assert data["final_result"] == {"output": "final-from-b"}
    assert "steps" not in data
    assert "summary-from-a" not in finished.text


async def test_failed_first_step_never_queues_second(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    first = await _create_agent(db_session, "A")
    second = await _create_agent(db_session, "B")
    chain = await _create_chain(client, first.id, second.id)
    started = await client.post(f"{CHAINS}/{chain['id']}/runs", headers=AUTH)
    run_id = started.json()["data"]["id"]
    first_step = (await client.get(f"{CHAINS}/runs/{run_id}/steps", headers=AUTH)).json()[
        "data"
    ][0]
    await _complete(
        client,
        db_session,
        uuid.UUID(first_step["execution_id"]),
        status="failed",
        error={"code": "boom", "message": "agent failed"},
    )

    run = (await client.get(f"{CHAINS}/runs/{run_id}", headers=AUTH)).json()["data"]
    assert run["status"] == "failed"
    steps = (await client.get(f"{CHAINS}/runs/{run_id}/steps", headers=AUTH)).json()["data"]
    assert [step["position"] for step in steps] == [0, 1]
    assert steps[0]["status"] == "failed"
    assert steps[1]["status"] == "skipped"
    assert steps[1]["execution_id"] is None
    queued = (
        await db_session.execute(
            select(AgentExecution).where(AgentExecution.agent_id == second.id)
        )
    ).scalars().all()
    assert queued == []


async def test_cross_tenant_run_is_forbidden(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _create_agent(db_session, "A")
    chain = await _create_chain(client, agent.id)
    response = await client.post(f"{CHAINS}/{chain['id']}/runs", headers=OTHER)
    assert response.status_code == 403
