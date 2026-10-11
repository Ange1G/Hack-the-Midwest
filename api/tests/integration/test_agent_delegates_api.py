import uuid

from httpx import AsyncClient

OWNER = "sso-user-a"
AUTH = {"X-Dev-User-SSO": OWNER}
OTHER_OWNER = "sso-user-b"
OTHER = {"X-Dev-User-SSO": OTHER_OWNER}


async def _create(client: AsyncClient, title: str, configurations: dict, *, owner: str = OWNER):
    return await client.post(
        f"/api/v1/agents/{owner}",
        json={"agentTitle": title, "systemPrompt": "Help", "configurations": configurations},
        headers={"X-Dev-User-SSO": owner},
    )


async def test_create_agent_with_owned_delegate_and_memory(client: AsyncClient) -> None:
    helper = (await _create(client, "Researcher", {"primitives": {}})).json()["data"]
    response = await _create(
        client,
        "Lead",
        {"primitives": {}, "memory": True, "delegates": [helper["id"], helper["id"]]},
    )
    assert response.status_code == 201, response.text
    configurations = response.json()["data"]["configurations"]
    assert configurations["memory"] is True
    assert configurations["delegates"] == [helper["id"]]


async def test_defaults_are_not_stored(client: AsyncClient) -> None:
    response = await _create(client, "Plain", {"primitives": {}})
    configurations = response.json()["data"]["configurations"]
    assert "memory" not in configurations
    assert "delegates" not in configurations


async def test_delegate_must_exist_and_belong_to_owner(client: AsyncClient) -> None:
    foreign = (
        await _create(client, "Theirs", {"primitives": {}}, owner=OTHER_OWNER)
    ).json()["data"]
    response = await _create(
        client, "Lead", {"primitives": {}, "delegates": [foreign["id"], str(uuid.uuid4())]}
    )
    assert response.status_code == 422
    errors = response.json()["error"]["details"]["errors"]
    assert [e["field"] for e in errors] == [
        "configurations.delegates.0",
        "configurations.delegates.1",
    ]
    assert all(e["message"] == "Agent not found" for e in errors)


async def test_agent_cannot_delegate_to_itself(client: AsyncClient) -> None:
    agent = (await _create(client, "Solo", {"primitives": {}})).json()["data"]
    response = await client.patch(
        f"/api/v1/agents/{OWNER}/{agent['id']}",
        json={"configurations": {"primitives": {}, "delegates": [agent["id"]]}},
        headers=AUTH,
    )
    assert response.status_code == 422
    assert response.json()["error"]["details"]["errors"][0]["message"] == (
        "An agent cannot delegate to itself"
    )


async def test_too_many_delegates_rejected(client: AsyncClient) -> None:
    response = await _create(
        client, "Lead", {"primitives": {}, "delegates": [str(uuid.uuid4()) for _ in range(6)]}
    )
    assert response.status_code == 422
