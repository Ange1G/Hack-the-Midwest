# Plan: Knowledge / documents connector

## Contract

`type: "knowledge"`, no credentials. Config: `maxResults` (1–10, default 5), the number of hits a search returns. Documents are not inlined on the connector row; they live in `knowledge_documents`.

## Persistence

Migration `011_knowledge_memory`: `knowledge_documents (id, connector_id FK connectors ON DELETE CASCADE, owner_user_sso, title, body, size_bytes, created_at)`, index on `(connector_id, created_at)`.

Limits (service): 50 documents per connector, 100 000 bytes per document, 1 000 000 bytes per connector, title 1–200 characters.

## API (owner-scoped, under the connectors router)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/connectors/{sso}/{connector_id}/documents` | List metadata + 240-character excerpt, newest first |
| POST | `/api/v1/connectors/{sso}/{connector_id}/documents` | `{title, body}`; 201 |
| DELETE | `/api/v1/connectors/{sso}/{connector_id}/documents/{document_id}` | 204 |

The connector must be the caller's (else 404) and of type `knowledge` (else 422 `connector_not_knowledge`).

## Snapshot transport (decision)

The worker loads attached documents at claim time and sends a JSON run context to the container on **stdin** (`docker run -i`, env `RUN_CONTEXT_STDIN=1`). Rationale: env vars cap each value at 128 KiB on Linux, and a host file mount does not work when the worker itself runs in a container. The container never gets platform DB access. Runs whose snapshot exceeds 4 MB fail closed with `knowledge_too_large`.

## Runner

`knowledge_tools.py` (no Strands import): paragraph-aware chunks of ~1200 characters with 200 overlap, BM25 ranking, title boost. `search(query)` returns up to `maxResults` hits (`document_id`, `title`, `chunk`, 700-character snippet). `read(document_id, offset)` returns up to 6000 characters.

## Frontend

Knowledge type card and form (name, description, first document). Connector detail page `/connectors/$connectorId` lists documents with add/delete; MCP connectors show their advertised tools there.
