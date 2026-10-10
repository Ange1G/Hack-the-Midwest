# Task: Connectors table, generic primitive contract, and MCP connectors

## Problem

Agents need reusable tools ("primitives"). Embedding each HTTP contract and its credentials inside every agent duplicates configuration and credentials across agents, and the team has agreed a generic contract that every primitive follows plus a specific contract for MCP servers. Connectors must be stored once per user and referenced by agents, so agents and connectors stay separate.

Builds on [2026-10-10-agent-create-http-contract](../2026-10-10-agent-create-http-contract/task.md), whose inline HTTP primitives and `agent_secrets` table this change replaces.

## Agreed contracts (team, 2026-10-10)

Generic contract for primitives:

```text
{
  type: string,                       // "http" | "mcp"
  contractVersion: int,
  name: string,
  description?: string | null,
  options?: { retries?: int | null /* max 5 */, timeout?: int | null /* ms, max 60000 */ } | null,
  credentials?: JSON | null,
  config: {...}
}
```

HTTP (from the original HTTP contract, nested into the generic shape):

```text
{
  type: "http", contractVersion: int, name: string, description?, options?,
  credentials?: { xApiKey?: string | null, authorizationHeader?: string | null } | null,
  config: { method: string, URL: string, payload?: JSON | null }
}
```

MCP servers:

```text
{
  type: "mcp", contractVersion: int, name: string, description?,
  options?: { retries?: int | null /* max 5, connection only */, timeout?: int | null /* ms, per tool call */ } | null,
  credentials?: { xApiKey?: string | null, authorizationHeader?: string | null } | null,
  config: { URL: string }
}
```

Agents (unchanged from the team spec): `title`, `systemPrompt`, `configurations` JSONB `{ primitives: {...}, month: int, dayOfWeek: int[], timeOfDay: int[] }`; `GET` / `POST /api/v1/agents/:userSSO`; responses use the API envelope.

## Goals

1. Connectors are their own resource: `connectors` table owned by a user, credentials in `connector_secrets` (encrypted).
2. `POST /api/v1/connectors/{user_sso}` creates a connector from the generic contract; `GET` lists the caller's connectors (paginated, credentials masked).
3. Agents reference connectors by ID in `configurations.primitives`; agents never store credentials.
4. `GET /api/v1/connector-types` lists the connector types and their JSON Schemas for the frontend.

## Constraints

See [AGENTS.md](../../AGENTS.md). Specifically:

- Tenant isolation: an agent may reference only connectors owned by the same user; another user's connector is indistinguishable from a missing one.
- Least privilege for MCP: AGENTS.md forbids connectors that "automatically grant an agent access to every resource available to its credentials", so each agent's reference to an MCP connector lists the tools that agent may call.
- No arbitrary code execution: MCP `stdio` transport is not accepted.
- Original team source lines stay untouched (additive only); code from the earlier unmerged patches may be reworked.

## Acceptance criteria

1. Both contract types validate the generic fields identically (`contractVersion` 1, `name` identifier-style, `description` ≤ 1,000, `options` bounds) and their own `config` / `credentials`; unknown fields and unknown `type` values are rejected.
2. HTTP `config`: GET/POST, public http(s) `URL` (SSRF guard), no payload on GET. MCP `config`: public http(s) `URL`, `transport` `streamableHttp` only.
3. `POST /api/v1/connectors/{user_sso}` → `201` envelope; every `credentials` value encrypted in `connector_secrets` and returned as `"********"`; `409` on a duplicate name for the same user; `503` if credentials are sent without an encryption key; `401` / `403` like the agents routes; `422` with `configurations`-style field paths for invalid contracts.
4. `GET /api/v1/connectors/{user_sso}` → paginated envelope of the caller's connectors only, credentials masked.
5. `configurations.primitives` is an object keyed by connector ID: `{ "<connectorId>": { allowedTools?: string[] } }`. Creating an agent fails with `422` if a referenced connector is missing or owned by someone else, if an MCP reference has no `allowedTools`, or if an HTTP reference has `allowedTools`.
6. Migration `003` replaces `agent_secrets` with `connectors` and `connector_secrets`; upgrade → downgrade → upgrade succeeds; `alembic check` is clean.
7. `GET /api/v1/connector-types` returns `http` and `mcp` with name, description, credential fields, and JSON Schema.
8. All existing team tests pass unchanged; new tests cover the above.

## Out of scope

Executing connectors (worker), connector update/delete endpoints, production SSO, database connectors.
