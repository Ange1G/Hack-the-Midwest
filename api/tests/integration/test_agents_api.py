import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_agents_returns_envelope_shape(
    client: AsyncClient,
    seeded_agents: dict,
) -> None:
    owner = "sso-user-a"
    response = await client.get(
        f"/api/v1/agents/{owner}",
        headers={"X-Dev-User-SSO": owner},
        params={"page": 1, "page_size": 20},
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"data", "error", "metadata", "pagination"}
    assert body["error"] is None
    assert "request_id" in body["metadata"]
    assert body["pagination"]["page"] == 1
    assert body["pagination"]["page_size"] == 20
    assert body["pagination"]["total_items"] == 3
    assert len(body["data"]) == 3


@pytest.mark.asyncio
async def test_list_agents_filters_by_owner(
    client: AsyncClient,
    seeded_agents: dict,
) -> None:
    owner = "sso-user-a"
    response = await client.get(
        f"/api/v1/agents/{owner}",
        headers={"X-Dev-User-SSO": owner},
    )
    titles = {item["title"] for item in response.json()["data"]}
    assert titles == {"Agent A0", "Agent A1", "Agent A2"}
    for item in response.json()["data"]:
        assert item["owner_user_sso"] == owner


@pytest.mark.asyncio
async def test_list_agents_pagination(
    client: AsyncClient,
    seeded_agents: dict,
) -> None:
    owner = "sso-user-a"
    response = await client.get(
        f"/api/v1/agents/{owner}",
        headers={"X-Dev-User-SSO": owner},
        params={"page": 1, "page_size": 2},
    )
    body = response.json()
    assert len(body["data"]) == 2
    assert body["pagination"]["total_items"] == 3
    assert body["pagination"]["total_pages"] == 2


@pytest.mark.asyncio
async def test_cross_tenant_forbidden(client: AsyncClient, seeded_agents: dict) -> None:
    response = await client.get(
        "/api/v1/agents/sso-user-a",
        headers={"X-Dev-User-SSO": "sso-user-b"},
    )
    assert response.status_code == 403
    body = response.json()
    assert body["data"] is None
    assert body["error"]["code"] == "forbidden"
    assert body["pagination"] is None


@pytest.mark.asyncio
async def test_missing_auth_header_returns_401(client: AsyncClient) -> None:
    response = await client.get("/api/v1/agents/sso-user-a")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"
