# Implementation: Knowledge / documents connector

Status: implemented; awaiting human review.

## What shipped

### API

- Connector type `knowledge` (`primitives/knowledge_contract.py`). Its config is `maxResults`, 1 to 10, default 5. It has no credentials.
- Table `knowledge_documents` (migration `011_knowledge_memory`): `title` up to 200 characters, a text `body`, and `size_bytes`. Documents are cascade-deleted with the connector.
- Limits: 100 KB per document, 50 documents and 1 MB per connector. Exceeding them returns 422 `knowledge_limit_exceeded`; adding a document to a non-knowledge connector returns 422 `connector_not_knowledge`.
- Endpoints: `GET`, `POST` and `DELETE` on `/connectors/{sso}/{connector_id}/documents[/{document_id}]`. They are owner-scoped and return 404 for other users. Responses include a 240-character excerpt, never the full body.

### Worker and runner

- At claim time the worker loads the documents of every attached knowledge connector, plus those of delegates' connectors. They are sent to the container as part of the stdin run context: `docker run -i` with `RUN_CONTEXT_STDIN=1`. The snapshot is capped at 4 MB; a larger one fails the run with `knowledge_too_large`.
- In the runner, `knowledge_tools.py` builds an in-memory BM25 index: 1200-character chunks with 200 overlap, plus a title boost. Each connector gets two tools:
  - `<name>__search(query)` returns the top `maxResults` passages with document ids;
  - `<name>__read(document_id, offset)` returns 6000-character pages.

### Frontend

- Knowledge appears in the connector type picker on `/connectors/new`. After it is created, the app opens the connector's detail page.
- It does not appear in the agent form's inline "Create new" picker; attach it with "Use existing".
- A new route, `/connectors/$connectorId`:
  - for knowledge connectors, a document list with size, excerpt and delete, and an "Add a document" form (title, content, "Load file" for `.txt`/`.md`/`.csv`/`.json`, a 100 KB byte check);
  - for other types, the non-secret config.
- Connector names in the list link to the detail page, and a Knowledge type card was added.

## Decisions

- **Stdin transport.** Environment variables are limited to 128 KiB each. File mounts break when the worker itself runs in a container.
- **Keyword search, no embeddings.** It needs no new dependency or vendor and works offline in the sandbox.

## Tests

- API: `test_knowledge_api.py`, `test_execution_worker_context.py`, `test_run_context.py` and `test_runner_context_tools.py`. They cover limits, cross-user isolation, the snapshot cap, and search and read.
- FE: `connector-detail.test.tsx` (add, delete, validation, not found).
