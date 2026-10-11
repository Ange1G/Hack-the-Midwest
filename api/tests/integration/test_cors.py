from httpx import AsyncClient

ORIGIN = "http://localhost:3000"
OWNER = "sso-user-a"


async def test_agents_list_cors_preflight(client: AsyncClient) -> None:
    response = await client.options(
        f"/api/v1/agents/{OWNER}",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-dev-user-sso",
        },
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == ORIGIN
    assert response.headers.get("access-control-allow-credentials") == "true"
    allow_headers = response.headers.get("access-control-allow-headers", "").lower()
    assert "x-dev-user-sso" in allow_headers
