from httpx import AsyncClient

from app.domains.knowledge.schemas import MAX_DOCUMENT_BYTES

OWNER = "sso-user-a"
AUTH = {"X-Dev-User-SSO": OWNER}
OTHER_OWNER = "sso-user-b"
OTHER = {"X-Dev-User-SSO": OTHER_OWNER}

KNOWLEDGE = {
    "type": "knowledge",
    "contractVersion": 1,
    "name": "runbooks",
    "description": "On-call runbooks",
    "config": {"maxResults": 3},
}


async def _knowledge_connector(client: AsyncClient, owner: str = OWNER) -> str:
    response = await client.post(
        f"/api/v1/connectors/{owner}",
        json=KNOWLEDGE,
        headers={"X-Dev-User-SSO": owner},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


def _docs_url(connector_id: str, owner: str = OWNER) -> str:
    return f"/api/v1/connectors/{owner}/{connector_id}/documents"


async def test_knowledge_connector_contract_defaults(client: AsyncClient) -> None:
    response = await client.post(
        f"/api/v1/connectors/{OWNER}",
        json={"type": "knowledge", "contractVersion": 1, "name": "notes"},
        headers=AUTH,
    )
    assert response.status_code == 201, response.text
    assert response.json()["data"]["contract"]["config"] == {"maxResults": 5}


async def test_add_list_delete_documents(client: AsyncClient) -> None:
    connector_id = await _knowledge_connector(client)
    created = await client.post(
        _docs_url(connector_id),
        json={"title": "Pager rotation", "body": "Escalate to the secondary after 15 minutes."},
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    document = created.json()["data"]
    assert document["title"] == "Pager rotation"
    assert document["size_bytes"] == len(b"Escalate to the secondary after 15 minutes.")
    assert document["excerpt"].startswith("Escalate")
    assert "body" not in document

    listed = await client.get(_docs_url(connector_id), headers=AUTH)
    assert [d["id"] for d in listed.json()["data"]] == [document["id"]]

    deleted = await client.delete(f"{_docs_url(connector_id)}/{document['id']}", headers=AUTH)
    assert deleted.status_code == 204
    again = await client.delete(f"{_docs_url(connector_id)}/{document['id']}", headers=AUTH)
    assert again.status_code == 404


async def test_documents_are_owner_scoped(client: AsyncClient) -> None:
    connector_id = await _knowledge_connector(client)
    foreign_path = await client.get(_docs_url(connector_id, OTHER_OWNER), headers=OTHER)
    assert foreign_path.status_code == 404
    impersonation = await client.get(_docs_url(connector_id), headers=OTHER)
    assert impersonation.status_code == 403


async def test_documents_rejected_on_non_knowledge_connector(client: AsyncClient) -> None:
    http = await client.post(
        f"/api/v1/connectors/{OWNER}",
        json={
            "type": "http",
            "contractVersion": 1,
            "name": "status",
            "config": {"method": "GET", "URL": "https://status.example.com/api"},
        },
        headers=AUTH,
    )
    response = await client.post(
        _docs_url(http.json()["data"]["id"]),
        json={"title": "x", "body": "y"},
        headers=AUTH,
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "connector_not_knowledge"


async def test_oversized_document_is_rejected_with_field(client: AsyncClient) -> None:
    connector_id = await _knowledge_connector(client)
    # Under the character cap but over the byte cap (3 bytes per character).
    body = "€" * (MAX_DOCUMENT_BYTES // 2)
    response = await client.post(
        _docs_url(connector_id), json={"title": "big", "body": body}, headers=AUTH
    )
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "knowledge_limit_exceeded"
    assert error["details"]["errors"][0]["field"] == "body"


async def test_deleting_connector_removes_documents(client: AsyncClient) -> None:
    connector_id = await _knowledge_connector(client)
    await client.post(
        _docs_url(connector_id), json={"title": "a", "body": "b"}, headers=AUTH
    )
    deleted = await client.delete(f"/api/v1/connectors/{OWNER}/{connector_id}", headers=AUTH)
    assert deleted.status_code == 204
    listed = await client.get(_docs_url(connector_id), headers=AUTH)
    assert listed.status_code == 404
