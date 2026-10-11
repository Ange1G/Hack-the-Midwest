import uuid
from typing import Any

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.agents.models import Agent

OWNER = "sso-user-a"
AUTH = {"X-Dev-User-SSO": OWNER}
OTHER = {"X-Dev-User-SSO": "sso-user-b"}
AGENTS_URL = f"/api/v1/agents/{OWNER}"

HTTP = {
    "type": "http",
    "contractVersion": 1,
    "name": "list_issues",
    "config": {"method": "GET", "URL": "https://api.github.com/repos/acme/web/issues"},
}
MCP = {
    "type": "mcp",
    "contractVersion": 1,
    "name": "linear",
    "config": {"URL": "https://mcp.linear.example.com/mcp"},
}


async def create_connector(
    client: AsyncClient, body: dict[str, Any], *, owner: str = OWNER
) -> str:
    response = await client.post(
        f"/api/v1/connectors/{owner}", json=body, headers={"X-Dev-User-SSO": owner}
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


def agent_body(primitives: dict[str, Any], **schedule: Any) -> dict[str, Any]:
    return {
        "agentTitle": "Weekday GitHub digest",
        "systemPrompt": "Summarize new issues from the last day.",
        "configurations": {"primitives": primitives, **schedule},
    }


async def test_create_agent_referencing_own_connectors(client: AsyncClient) -> None:
    http_id = await create_connector(client, HTTP)
    mcp_id = await create_connector(client, MCP)

    response = await client.post(
        AGENTS_URL,
        json=agent_body(
            {http_id: {}, mcp_id: {"allowedTools": ["search_issues", "get_issue"]}},
            dayOfWeek=[1, 2, 3, 4, 5],
            timeOfDay=[540],
        ),
        headers=AUTH,
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert set(body) == {"data", "error", "metadata", "pagination"}
    agent = body["data"]
    assert agent["title"] == "Weekday GitHub digest"
    assert agent["system_prompt"] == "Summarize new issues from the last day."
    assert agent["owner_user_sso"] == OWNER
    assert agent["configurations"] == {
        "primitives": {http_id: {}, mcp_id: {"allowedTools": ["search_issues", "get_issue"]}},
        "dayOfWeek": [1, 2, 3, 4, 5],
        "timeOfDay": [540],
    }


async def test_created_agent_is_listed(client: AsyncClient) -> None:
    http_id = await create_connector(client, HTTP)
    created = await client.post(AGENTS_URL, json=agent_body({http_id: {}}), headers=AUTH)
    listed = await client.get(AGENTS_URL, headers=AUTH)
    assert created.json()["data"]["id"] in [a["id"] for a in listed.json()["data"]]


async def test_get_agent_by_id(client: AsyncClient) -> None:
    created = await client.post(AGENTS_URL, json=agent_body({}), headers=AUTH)
    agent_id = created.json()["data"]["id"]
    response = await client.get(f"{AGENTS_URL}/{agent_id}", headers=AUTH)
    assert response.status_code == 200, response.text
    assert response.json()["data"]["id"] == agent_id


async def test_get_agent_missing_is_404(client: AsyncClient) -> None:
    missing = uuid.uuid4()
    response = await client.get(f"{AGENTS_URL}/{missing}", headers=AUTH)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_agent_without_connectors_is_allowed(client: AsyncClient) -> None:
    response = await client.post(AGENTS_URL, json=agent_body({}), headers=AUTH)
    assert response.status_code == 201


async def test_referencing_another_users_connector_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    their_id = await create_connector(client, HTTP, owner="sso-user-b")
    response = await client.post(AGENTS_URL, json=agent_body({their_id: {}}), headers=AUTH)

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "invalid_configuration"
    assert error["details"]["errors"] == [
        {"field": f"configurations.primitives.{their_id}", "message": "Connector not found"}
    ]
    assert (await db_session.execute(select(Agent))).scalars().all() == []


async def test_unknown_connector_gets_the_same_answer(client: AsyncClient) -> None:
    missing = str(uuid.uuid4())
    response = await client.post(AGENTS_URL, json=agent_body({missing: {}}), headers=AUTH)
    assert response.status_code == 422
    assert response.json()["error"]["details"]["errors"][0]["message"] == "Connector not found"


async def test_mcp_reference_requires_allowed_tools(client: AsyncClient) -> None:
    mcp_id = await create_connector(client, MCP)
    response = await client.post(AGENTS_URL, json=agent_body({mcp_id: {}}), headers=AUTH)
    assert response.status_code == 422
    error = response.json()["error"]["details"]["errors"][0]
    assert error["field"] == f"configurations.primitives.{mcp_id}"
    assert "allowedTools" in error["message"]


async def test_http_reference_rejects_allowed_tools(client: AsyncClient) -> None:
    http_id = await create_connector(client, HTTP)
    response = await client.post(
        AGENTS_URL, json=agent_body({http_id: {"allowedTools": ["x"]}}), headers=AUTH
    )
    assert response.status_code == 422


async def test_invalid_schedule_returns_422(client: AsyncClient) -> None:
    response = await client.post(AGENTS_URL, json=agent_body({}, timeOfDay=[1440]), headers=AUTH)
    assert response.status_code == 422
    fields = [e["field"] for e in response.json()["error"]["details"]["errors"]]
    assert any(f.startswith("configurations.timeOfDay") for f in fields)


async def test_inline_contracts_are_no_longer_accepted(client: AsyncClient) -> None:
    response = await client.post(AGENTS_URL, json=agent_body({"list_issues": HTTP}), headers=AUTH)
    assert response.status_code == 422


async def test_cross_tenant_create_is_forbidden(client: AsyncClient) -> None:
    response = await client.post(AGENTS_URL, json=agent_body({}), headers=OTHER)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


async def test_create_requires_authentication(client: AsyncClient) -> None:
    response = await client.post(AGENTS_URL, json=agent_body({}))
    assert response.status_code == 401


async def test_missing_title_returns_422_envelope(client: AsyncClient) -> None:
    body = agent_body({})
    del body["agentTitle"]
    response = await client.post(AGENTS_URL, json=body, headers=AUTH)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_spec_typo_agent_tile_is_accepted(client: AsyncClient) -> None:
    body = agent_body({})
    body["agentTile"] = body.pop("agentTitle")
    response = await client.post(AGENTS_URL, json=body, headers=AUTH)
    assert response.status_code == 201
    assert response.json()["data"]["title"] == "Weekday GitHub digest"
