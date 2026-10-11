import uuid
from typing import Any

from httpx import AsyncClient

from tests.integration.test_agents_create_api import (
    AGENTS_URL,
    AUTH,
    HTTP,
    MCP,
    OTHER,
    OWNER,
    agent_body,
    create_connector,
)


async def create_agent(client: AsyncClient, primitives: dict[str, Any] | None = None) -> dict:
    response = await client.post(
        AGENTS_URL, json=agent_body(primitives or {}), headers=AUTH
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


async def test_patch_agent_title_and_prompt(client: AsyncClient) -> None:
    agent = await create_agent(client)
    response = await client.patch(
        f"{AGENTS_URL}/{agent['id']}",
        json={"agentTitle": "Renamed digest", "systemPrompt": "Do less."},
        headers=AUTH,
    )
    assert response.status_code == 200, response.text
    body = response.json()["data"]
    assert body["title"] == "Renamed digest"
    assert body["system_prompt"] == "Do less."
    assert body["configurations"] == agent["configurations"]
    assert body["id"] == agent["id"]
    assert body["owner_user_sso"] == OWNER


async def test_patch_replaces_configurations(client: AsyncClient) -> None:
    http_id = await create_connector(client, HTTP)
    mcp_id = await create_connector(client, MCP)
    agent = await create_agent(client, {http_id: {}})

    response = await client.patch(
        f"{AGENTS_URL}/{agent['id']}",
        json={
            "configurations": {
                "primitives": {
                    mcp_id: {"allowedTools": ["search_issues"]},
                },
                "dayOfWeek": [1],
                "timeOfDay": [540],
            }
        },
        headers=AUTH,
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["configurations"] == {
        "primitives": {mcp_id: {"allowedTools": ["search_issues"]}},
        "dayOfWeek": [1],
        "timeOfDay": [540],
    }


async def test_patch_rejects_foreign_connector(client: AsyncClient) -> None:
    agent = await create_agent(client)
    their_id = await create_connector(client, HTTP, owner="sso-user-b")
    response = await client.patch(
        f"{AGENTS_URL}/{agent['id']}",
        json={"configurations": {"primitives": {their_id: {}}}},
        headers=AUTH,
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_configuration"
    fetched = await client.get(f"{AGENTS_URL}/{agent['id']}", headers=AUTH)
    assert fetched.json()["data"]["configurations"] == agent["configurations"]


async def test_patch_mcp_requires_allowed_tools(client: AsyncClient) -> None:
    mcp_id = await create_connector(client, MCP)
    agent = await create_agent(client)
    response = await client.patch(
        f"{AGENTS_URL}/{agent['id']}",
        json={"configurations": {"primitives": {mcp_id: {}}}},
        headers=AUTH,
    )
    assert response.status_code == 422
    assert "allowedTools" in response.json()["error"]["details"]["errors"][0]["message"]


async def test_patch_empty_body_is_422(client: AsyncClient) -> None:
    agent = await create_agent(client)
    response = await client.patch(f"{AGENTS_URL}/{agent['id']}", json={}, headers=AUTH)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_patch_missing_agent_is_404(client: AsyncClient) -> None:
    response = await client.patch(
        f"{AGENTS_URL}/{uuid.uuid4()}",
        json={"agentTitle": "Nope"},
        headers=AUTH,
    )
    assert response.status_code == 404


async def test_patch_cross_tenant_is_forbidden(client: AsyncClient) -> None:
    agent = await create_agent(client)
    response = await client.patch(
        f"{AGENTS_URL}/{agent['id']}",
        json={"agentTitle": "Stolen"},
        headers=OTHER,
    )
    assert response.status_code == 403
