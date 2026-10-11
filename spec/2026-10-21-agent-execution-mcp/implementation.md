# Implementation: MCP connectors at execution time

**Status:** Implemented.

## What landed

- Worker lists tools from each referenced MCP server at claim time and intersects them with the agent's `allowedTools`. Missing allowlisted tools fail the execution (`mcp_tool_missing`) before the container starts.
- `MCP_SERVERS_JSON` / `MCP_CREDENTIALS_JSON` are injected like HTTP tools. Secrets stay out of the manifest.
- Runner `mcp_tools.py` calls streamable HTTP `tools/call` and refuses tools that are not on the allowlist.

## Validation

```bash
cd api && uv run pytest tests/unit/test_mcp_tool_bundle.py tests/unit/test_mcp_tools.py tests/unit/test_http_tool_bundle.py tests/unit/test_docker_runner.py tests/integration/test_execution_worker.py tests/integration/test_execution_worker_mcp.py -q
```
