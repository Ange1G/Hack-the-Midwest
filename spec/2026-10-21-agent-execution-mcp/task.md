# Task: MCP connectors at execution time

## Problem

Users can create MCP connectors and must set `allowedTools` on the agent, but the worker only bundles HTTP connectors and the runner has no MCP client. BYO MCP servers are inert at runtime.

Builds on [2026-10-10-connectors](../2026-10-10-connectors/task.md) and [2026-10-10-agent-execution-http-tools](../2026-10-10-agent-execution-http-tools/task.md).

**Depends on (recommended order):** [2026-10-21-agent-execution-database](../2026-10-21-agent-execution-database/task.md) optional; can ship in parallel if bundle refactor is clean.

## Goals

1. Worker loads MCP connectors referenced on the agent, decrypts credentials, intersects `allowedTools` with server-advertised tools (fail closed).
2. Runner connects via **streamable HTTP** only ([`McpContract`](../../api/src/app/domains/primitives/mcp_contract.py)).
3. Each allowed MCP tool becomes a Strands `@tool` with timeouts from connector `options`.
4. No credentials in manifest or callback JSON.

## Constraints

- Transport `stdio` remains unsupported.
- SSRF rules apply at connector save; optional re-check at run start for URL host.
- Cross-tenant connector IDs treated as missing.
- Tool allowlist enforced in trusted worker code before container starts.

## Acceptance criteria

1. Integration or contract test with mocked MCP server: agent run invokes only an allowed tool name.
2. Tool not on `allowedTools` is never registered; tool on allowlist but absent on server fails claim/bundle with explicit error.
3. `HTTP_TOOLS_JSON` / MCP env contain no secret values.
4. HTTP-only and LLM-only agents unchanged.

## Out of scope

MCP proxy on worker, frontend, chains, per-run input (separate spec).
