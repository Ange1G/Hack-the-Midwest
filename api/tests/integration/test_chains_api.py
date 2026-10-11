import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.agents.models import Agent

OWNER = "sso-user-a"
AUTH = {"X-Dev-User-SSO": OWNER}
OTHER = {"X-Dev-User-SSO": "sso-user-b"}
URL = f"/api/v1/chains/{OWNER}"


async def _create_agent(
    db_session: AsyncSession, *, owner: str = OWNER, title: str = "Digest"
) -> Agent:
    agent = Agent(
        title=title,
        system_prompt="Summarize",
        configurations={"primitives": {}},
        owner_user_sso=owner,
    )
    db_session.add(agent)
    await db_session.commit()
    await db_session.refresh(agent)
    return agent


async def test_create_and_get_chain_preserves_step_order(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    first = await _create_agent(db_session, title="A")
    second = await _create_agent(db_session, title="B")
    created = await client.post(
        URL,
        headers=AUTH,
        json={
            "title": "Triage",
            "steps": [
                {"agent_id": str(first.id), "label": "summarize"},
                {"agent_id": str(second.id)},
            ],
            "schedule": {"dayOfWeek": [1], "timeOfDay": [540]},
        },
    )
    assert created.status_code == 201, created.text
    data = created.json()["data"]
    assert data["title"] == "Triage"
    assert data["owner_user_sso"] == OWNER
    assert [step["position"] for step in data["steps"]] == [0, 1]
    assert [step["agent_id"] for step in data["steps"]] == [str(first.id), str(second.id)]
    assert data["steps"][0]["label"] == "summarize"
    assert data["schedule"] == {"dayOfWeek": [1], "timeOfDay": [540]}

    fetched = await client.get(f"{URL}/{data['id']}", headers=AUTH)
    assert fetched.status_code == 200
    assert fetched.json()["data"]["steps"] == data["steps"]


async def test_list_includes_created_chain(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _create_agent(db_session)
    created = await client.post(
        URL,
        headers=AUTH,
        json={"title": "One step", "steps": [{"agent_id": str(agent.id)}]},
    )
    listed = await client.get(URL, headers=AUTH)
    assert listed.status_code == 200
    ids = [item["id"] for item in listed.json()["data"]]
    assert created.json()["data"]["id"] in ids


async def test_foreign_agent_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    mine = await _create_agent(db_session)
    theirs = await _create_agent(db_session, owner="sso-user-b", title="Other")
    response = await client.post(
        URL,
        headers=AUTH,
        json={
            "title": "Leak",
            "steps": [
                {"agent_id": str(mine.id)},
                {"agent_id": str(theirs.id)},
            ],
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_chain"


async def test_missing_agent_is_rejected(client: AsyncClient) -> None:
    response = await client.post(
        URL,
        headers=AUTH,
        json={"title": "Ghost", "steps": [{"agent_id": str(uuid.uuid4())}]},
    )
    assert response.status_code == 422


async def test_empty_steps_returns_422(client: AsyncClient) -> None:
    response = await client.post(
        URL, headers=AUTH, json={"title": "Empty", "steps": []}
    )
    assert response.status_code == 422


async def test_cross_tenant_create_is_forbidden(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _create_agent(db_session)
    response = await client.post(
        URL,
        headers=OTHER,
        json={"title": "Nope", "steps": [{"agent_id": str(agent.id)}]},
    )
    assert response.status_code == 403


async def test_delete_then_get_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    agent = await _create_agent(db_session)
    created = await client.post(
        URL,
        headers=AUTH,
        json={"title": "Temp", "steps": [{"agent_id": str(agent.id)}]},
    )
    chain_id = created.json()["data"]["id"]
    deleted = await client.delete(f"{URL}/{chain_id}", headers=AUTH)
    assert deleted.status_code == 204
    fetched = await client.get(f"{URL}/{chain_id}", headers=AUTH)
    assert fetched.status_code == 404
