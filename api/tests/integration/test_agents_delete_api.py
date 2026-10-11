import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.agents.models import Agent
from app.domains.chains.models import AgentChain, AgentChainStep

OWNER = "sso-user-a"
OTHER_OWNER = "sso-user-b"
AUTH = {"X-Dev-User-SSO": OWNER}
OTHER = {"X-Dev-User-SSO": OTHER_OWNER}
URL = f"/api/v1/agents/{OWNER}"


async def _create_agent(
    client: AsyncClient,
    *,
    owner: str = OWNER,
    title: str = "Temp agent",
) -> dict[str, Any]:
    resp = await client.post(
        f"/api/v1/agents/{owner}",
        json={"agentTitle": title, "systemPrompt": "Help", "configurations": {"primitives": {}}},
        headers={"X-Dev-User-SSO": owner},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


@pytest.mark.asyncio
async def test_delete_agent_returns_204(client: AsyncClient) -> None:
    agent = await _create_agent(client)
    agent_id = agent["id"]

    response = await client.delete(f"{URL}/{agent_id}", headers=AUTH)
    assert response.status_code == 204
    assert response.content == b""

    # GET now returns 404
    get_response = await client.get(f"{URL}/{agent_id}", headers=AUTH)
    assert get_response.status_code == 404

    # Absent from list
    listed = await client.get(URL, headers=AUTH)
    assert all(a["id"] != agent_id for a in listed.json()["data"])


@pytest.mark.asyncio
async def test_delete_agent_404_for_missing(client: AsyncClient) -> None:
    missing = str(uuid.uuid4())
    response = await client.delete(f"{URL}/{missing}", headers=AUTH)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


@pytest.mark.asyncio
async def test_delete_agent_404_for_another_tenants_agent(client: AsyncClient) -> None:
    theirs = await _create_agent(client, owner=OTHER_OWNER, title="Theirs")
    agent_id = theirs["id"]

    # Owner A cannot delete owner B's agent — treated as 404 to avoid leaking existence
    response = await client.delete(f"{URL}/{agent_id}", headers=AUTH)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_agent_403_wrong_path_user(client: AsyncClient) -> None:
    agent = await _create_agent(client)
    # Other user tries to hit the OWNER's path
    response = await client.delete(f"{URL}/{agent['id']}", headers=OTHER)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


@pytest.mark.asyncio
async def test_delete_agent_401_unauthenticated(client: AsyncClient) -> None:
    agent = await _create_agent(client)
    response = await client.delete(f"{URL}/{agent['id']}")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


@pytest.mark.asyncio
async def test_delete_agent_detaches_from_delegates(client: AsyncClient) -> None:
    """Deleting agent A removes it from agent B's configurations.delegates."""
    agent_a = await _create_agent(client, title="Helper A")
    agent_b_resp = await client.post(
        URL,
        json={
            "agentTitle": "Lead B",
            "systemPrompt": "Help",
            "configurations": {"primitives": {}, "delegates": [agent_a["id"]]},
        },
        headers=AUTH,
    )
    assert agent_b_resp.status_code == 201, agent_b_resp.text
    agent_b = agent_b_resp.json()["data"]

    # Verify delegate is present
    assert agent_a["id"] in agent_b["configurations"]["delegates"]

    # Delete agent A
    delete_resp = await client.delete(f"{URL}/{agent_a['id']}", headers=AUTH)
    assert delete_resp.status_code == 204

    # Agent B's delegates should now be empty
    b_after = (await client.get(f"{URL}/{agent_b['id']}", headers=AUTH)).json()["data"]
    assert agent_a["id"] not in b_after["configurations"].get("delegates", [])


@pytest.mark.asyncio
async def test_delete_agent_409_when_in_chain(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Deleting an agent that is a step in one of the owner's chains returns 409."""
    agent = await _create_agent(client, title="Chain member")

    # Create chain with this agent as a step directly via the DB
    chain = AgentChain(
        title="My Pipeline",
        owner_user_sso=OWNER,
    )
    db_session.add(chain)
    await db_session.flush()

    step = AgentChainStep(
        chain_id=chain.id,
        agent_id=uuid.UUID(agent["id"]),
        position=0,
    )
    db_session.add(step)
    await db_session.commit()

    response = await client.delete(f"{URL}/{agent['id']}", headers=AUTH)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "agent_in_use"

    # Agent must still exist
    get_resp = await client.get(f"{URL}/{agent['id']}", headers=AUTH)
    assert get_resp.status_code == 200
