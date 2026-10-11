# Implementation: MCP connector tools preview

## What shipped

- `GET /api/v1/connectors/{user_sso}/{connector_id}/tools` lists tools from a live MCP `tools/list`.
- Owner-only; missing/other-tenant ids are 404; non-MCP is 422 `connector_not_mcp`; upstream failures are 502 `mcp_unavailable`.
- Agent form: advertised tools as checkboxes when attaching an existing MCP connector; comma-separated names remain as fallback.

## Tests observed

- Unit: `test_connector_service.py` preview cases.
- Integration: HTTP connector preview 422; unknown id 404; cross-tenant 403.
- Frontend: attaching MCP lists `list_issues` / `create_issue` and submits `allowedTools`.

`cd api && uv run pytest tests/unit tests/integration/test_connectors_api.py` and `cd fe && npm test` passed as recorded in the HTTP parameterized implementation note.
