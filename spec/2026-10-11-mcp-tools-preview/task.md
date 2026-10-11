# Task: MCP connector tools preview

## Problem

MCP `allowedTools` is typed by hand. A typo or stale name fails at claim time (`mcp_tool_missing`) after the user already started a run.

## Goals

1. `GET /api/v1/connectors/{user_sso}/{connector_id}/tools` lists tools from a live MCP `tools/list`.
2. Owner-only; same 404 for missing and other-tenant ids.
3. Non-MCP connectors return 422 `connector_not_mcp`.
4. Unreachable MCP server returns 502 `mcp_unavailable` (no secrets in the body).
5. Agent form shows advertised tools as checkboxes when attaching an existing MCP connector; comma-separated names remain as fallback.

## Constraints

- Reuse [`list_mcp_tools`](../../api/src/app/worker/mcp_client.py); inject for tests.
- Decrypt credentials only in the API process; never return them.
- Bound the upstream timeout (connector `options.timeout`, default 10s, cap 30s).
- Do not persist the advertised list.

## Acceptance criteria

1. Owner of an MCP connector receives `{ connector_id, type: "mcp", tools: [...] }`.
2. HTTP/database connector → 422; unknown id → 404.
3. Frontend can pick advertised tools into `allowedTools`.
4. Existing agent create/edit without preview still works.

## Out of scope

Tool JSON Schema display, stdio MCP, auto-refresh on every keystroke.
