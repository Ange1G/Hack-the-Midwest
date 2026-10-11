# Plan: MCP connector tools preview

## API

`GET /connectors/{user_sso}/{connector_id}/tools` on the existing connectors router.

Service: load `get_with_secrets`, require `type == "mcp"`, decrypt, call injected `list_mcp_tools`, return names.

Map `BundleBuildError` with `mcp_unavailable` / `mcp_tool_missing` to HTTP 502.

## Frontend

- Schema + `useConnectorTools(id)` (enabled only for MCP ids).
- Mock handler for MSW.
- Agent form: checkboxes from preview; keep the text field for names the preview missed.

## Tests

- Unit: service with fake lister (success, not MCP, missing, list error).
- Integration: HTTP connector → 422; missing id → 404.
- FE: attaching MCP shows advertised tools and submits `allowedTools`.
