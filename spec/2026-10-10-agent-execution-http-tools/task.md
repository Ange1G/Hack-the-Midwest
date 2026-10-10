# Task: HTTP connector tools at execution time

## Problem

Agents reference HTTP connectors, but the runner only sends `system_prompt` to OpenAI. Connector URLs and credentials never reach the isolated container, so the agent cannot use the primitives the user configured.

## Goals

- When claiming a run, the worker loads the agent's owned HTTP connectors and decrypts credentials.
- The container receives a tool bundle with **fixed** method/URL/payload (no arbitrary URLs from the model).
- Credentials travel in a separate env var, never in `AGENT_MANIFEST` or callback `result`.
- MCP connectors are ignored in this slice (LLM-only for those agents).

## Constraints

See [AGENTS.md](../../AGENTS.md) and [2026-10-10-strands-openai-runner](../2026-10-10-strands-openai-runner/task.md).

- SSRF: the model cannot supply or override the request URL.
- Cross-tenant: only connectors owned by `owner_user_sso` are loaded.
- Missing referenced connectors fail the execution (`connector_missing`).
- Credentials present but no cipher: `secret_storage_unavailable` (no container).

## Acceptance criteria

1. An agent with an HTTP connector can complete a run whose tool call hits the stored URL.
2. `HTTP_TOOLS_JSON` and `AGENT_MANIFEST` contain no credential values.
3. Another user's connector id in the agent record is treated as missing (same as not found).
4. Unit tests prove URL override is rejected.
5. Existing enqueue/callback tests still pass without OpenAI.

## Out of scope

MCP tools, user-supplied LLM keys, frontend, Akamai, production SSO.
