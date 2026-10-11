from httpx import AsyncClient

OWNER = "sso-user-a"
AUTH = {"X-Dev-User-SSO": OWNER}
URL = f"/api/v1/agents/{OWNER}"
SCHEMA = {"type": "object", "required": ["summary"], "properties": {"summary": {"type": "string"}}}


def body(output_schema: object) -> dict:
    return {
        "agentTitle": "Triage",
        "systemPrompt": "Classify alerts.",
        "configurations": {"primitives": {}, "outputSchema": output_schema},
    }


async def test_agent_stores_and_returns_its_output_schema(client: AsyncClient) -> None:
    response = await client.post(URL, json=body(SCHEMA), headers=AUTH)
    assert response.status_code == 201, response.text
    agent = response.json()["data"]
    assert agent["configurations"]["outputSchema"] == SCHEMA

    cleared = await client.patch(
        f"{URL}/{agent['id']}",
        json={"configurations": {"primitives": {}}},
        headers=AUTH,
    )
    assert cleared.status_code == 200, cleared.text
    assert "outputSchema" not in cleared.json()["data"]["configurations"]


async def test_invalid_output_schema_is_422_with_field_path(client: AsyncClient) -> None:
    response = await client.post(URL, json=body({"type": "nope"}), headers=AUTH)
    assert response.status_code == 422, response.text
    fields = [e["field"] for e in response.json()["error"]["details"]["errors"]]
    assert any(field.startswith("configurations.outputSchema") for field in fields)


async def test_remote_ref_in_output_schema_is_rejected(client: AsyncClient) -> None:
    schema = {"$ref": "https://example.com/schema.json"}
    response = await client.post(URL, json=body(schema), headers=AUTH)
    assert response.status_code == 422, response.text
