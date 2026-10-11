# Plan: MCP connectors at execution time

## 1. Bundle (worker)

- Extend [`build_http_tool_bundle`](../../api/src/app/worker/bundle.py) or add `build_execution_bundle()` returning HTTP + MCP sections.
- For each MCP connector:
  - Load contract + decrypt headers (`xApiKey`, `authorizationHeader`).
  - Fetch tool list from server (worker-side MCP client, short timeout) OR defer list fetch to runner with pre-validated allowlist only—**prefer worker fetch** so bad configs fail before container.
  - Emit `MCP_SERVERS_JSON`: `{ id, name, URL, transport, tools: [names] }` where `tools` ⊆ `allowedTools` ∩ server tools.
  - `MCP_CREDENTIALS_JSON`: same pattern as HTTP.

## 2. Runner

- `mcp_tools.py`: streamable HTTP MCP client (official or minimal client aligned with spec).
- Register `@tool` per allowed tool; forward to MCP with auth headers from credentials map.
- [`entrypoint.py`](../../runner/entrypoint.py): merge MCP tools with HTTP tools.

## 3. Dependencies

- Add MCP client dependency to [`runner/requirements.txt`](../../runner/requirements.txt) (and worker if fetch runs there).

## 4. Tests

- Unit: allowlist intersection, missing server tool, credential masking.
- Integration: httpx/respx or local stub MCP HTTP endpoint.
- Regression: existing runner tests without MCP env.

## 5. Spec cross-link

- Update [api/README.md](../../api/README.md) MCP execution section.

## Validation

```bash
cd api && uv run pytest tests/unit/test_mcp_contract.py -q
cd runner && # add pytest if present, or api unit tests importing runner helpers
```
