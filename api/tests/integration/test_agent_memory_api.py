import uuid
from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.agents.models import Agent
from app.domains.executions.models import AgentExecution, ExecutionStatus
from app.domains.executions.tokens import hash_callback_token
from app.domains.memory.models import AgentMemory
from app.domains.memory.schemas import MAX_MEMORY_KEYS

OWNER = "sso-user-a"
AUTH = {"X-Dev-User-SSO": OWNER}
OTHER = {"X-Dev-User-SSO": "sso-user-b"}
TOKEN = "callback-secret"


async def _agent(db: AsyncSession, *, memory: bool) -> Agent:
    configurations: dict[str, Any] = {"primitives": {}}
    if memory:
        configurations["memory"] = True
    agent = Agent(
        title="Watcher",
        system_prompt="Watch",
        configurations=configurations,
        owner_user_sso=OWNER,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


async def _running(db: AsyncSession, agent: Agent) -> AgentExecution:
    execution = AgentExecution(
        agent_id=agent.id,
        owner_user_sso=OWNER,
        status=ExecutionStatus.RUNNING.value,
        callback_token_hash=hash_callback_token(TOKEN),
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)
    return execution


async def _complete(client: AsyncClient, execution_id: uuid.UUID, body: dict[str, Any]):
    return await client.post(
        f"/api/v1/internal/executions/{execution_id}/complete",
        json=body,
        headers={"X-Execution-Callback-Token": TOKEN},
    )


def _memory_url(agent: Agent) -> str:
    return f"/api/v1/agents/{OWNER}/{agent.id}/memory"


async def test_succeeded_callback_applies_memory_writes(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _agent(db_session, memory=True)
    db_session.add(AgentMemory(agent_id=agent.id, owner_user_sso=OWNER, key="old", value=1))
    await db_session.commit()
    execution = await _running(db_session, agent)

    response = await _complete(
        client,
        execution.id,
        {
            "status": "succeeded",
            "result": {"output": "done"},
            "memory": {"set": {"summary:site": {"bullets": ["a", "b"]}}, "delete": ["old"]},
        },
    )
    assert response.status_code == 200, response.text
    result = response.json()["data"]["result"]
    assert result["memory_writes"] == {
        "set": ["summary:site"],
        "deleted": ["old"],
        "dropped": [],
    }

    listed = await client.get(_memory_url(agent), headers=AUTH)
    assert listed.status_code == 200
    entries = listed.json()["data"]
    assert [(e["key"], e["value"]) for e in entries] == [
        ("summary:site", {"bullets": ["a", "b"]})
    ]


async def test_duplicate_callback_does_not_reapply(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _agent(db_session, memory=True)
    execution = await _running(db_session, agent)
    first = {"status": "succeeded", "result": {"output": "x"}, "memory": {"set": {"n": 1}}}
    assert (await _complete(client, execution.id, first)).status_code == 200
    second = {"status": "succeeded", "result": {"output": "x"}, "memory": {"set": {"n": 2}}}
    assert (await _complete(client, execution.id, second)).status_code == 200
    entries = (await client.get(_memory_url(agent), headers=AUTH)).json()["data"]
    assert entries[0]["value"] == 1


async def test_memory_ignored_when_agent_has_memory_disabled(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _agent(db_session, memory=False)
    execution = await _running(db_session, agent)
    response = await _complete(
        client,
        execution.id,
        {"status": "succeeded", "result": {"output": "x"}, "memory": {"set": {"k": "v"}}},
    )
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "succeeded"
    assert "memory_writes" not in response.json()["data"]["result"]
    assert (await client.get(_memory_url(agent), headers=AUTH)).json()["data"] == []


async def test_failed_callback_cannot_carry_memory(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _agent(db_session, memory=True)
    execution = await _running(db_session, agent)
    response = await _complete(
        client,
        execution.id,
        {
            "status": "failed",
            "error": {"code": "llm_error", "message": "boom"},
            "memory": {"set": {"k": "v"}},
        },
    )
    assert response.status_code == 422


async def test_malformed_memory_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _agent(db_session, memory=True)
    execution = await _running(db_session, agent)
    bad_key = await _complete(
        client,
        execution.id,
        {"status": "succeeded", "result": {}, "memory": {"set": {"has space": 1}}},
    )
    assert bad_key.status_code == 422
    too_big = await _complete(
        client,
        execution.id,
        {"status": "succeeded", "result": {}, "memory": {"set": {"k": "x" * 5000}}},
    )
    assert too_big.status_code == 422


async def test_key_cap_drops_new_keys(client: AsyncClient, db_session: AsyncSession) -> None:
    agent = await _agent(db_session, memory=True)
    for index in range(MAX_MEMORY_KEYS):
        db_session.add(
            AgentMemory(agent_id=agent.id, owner_user_sso=OWNER, key=f"k{index}", value=index)
        )
    await db_session.commit()
    execution = await _running(db_session, agent)
    response = await _complete(
        client,
        execution.id,
        {"status": "succeeded", "result": {}, "memory": {"set": {"k0": "updated", "new": 1}}},
    )
    assert response.json()["data"]["result"]["memory_writes"] == {
        "set": ["k0"],
        "deleted": [],
        "dropped": ["new"],
    }


async def test_memory_endpoints_delete_and_clear_owner_scoped(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _agent(db_session, memory=True)
    for key in ("a", "b"):
        db_session.add(AgentMemory(agent_id=agent.id, owner_user_sso=OWNER, key=key, value=key))
    await db_session.commit()

    assert (await client.get(_memory_url(agent), headers=OTHER)).status_code == 403
    foreign = await client.get(f"/api/v1/agents/sso-user-b/{agent.id}/memory", headers=OTHER)
    assert foreign.status_code == 404

    assert (await client.delete(f"{_memory_url(agent)}/a", headers=AUTH)).status_code == 204
    assert (await client.delete(f"{_memory_url(agent)}/a", headers=AUTH)).status_code == 404
    assert (await client.delete(_memory_url(agent), headers=AUTH)).status_code == 204
    assert (await client.get(_memory_url(agent), headers=AUTH)).json()["data"] == []
