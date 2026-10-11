# Task: Agent tool forms (HTTP and bring-your-own MCP)

Branch: `feat/agent-tool-forms` (from `redesign-agent`)
Date: 2026-10-10

See `AGENTS.md` for the project constitution. This document does not repeat it.

## Problem

`/agents/new` and `/agents/$agentId/edit` only model inline HTTP calls. The
roadmap (`AGENTS.md` requirements, `README.md` "Tool primitives" and
"Bring-your-own integrations") and the team's agreed tool contracts
(`spec/2026-10-10-connectors/task.md`) describe two tool types an agent can be
given: HTTP requests and user-provided MCP servers. The builder should represent
both, and the tools that are actually implemented today.

## Agreed tool contracts (from the teammate's task)

Shared shape:

```text
{
  type: string,                 // "http" | "mcp"
  contractVersion: int,
  name: string,
  options?: { retries?: int | null /* max 5 */, timeout?: int | null /* ms, max 60000 */ } | null,
  credentials?: JSON | null,
  config: {...}
}
```

MCP:

```text
{
  type: "mcp", contractVersion: int, name: string,
  description?: string | null,
  options?: { retries?: int | null /* max 5, connection only */, timeout?: int | null /* ms, per tool call */ } | null,
  credentials?: { xApiKey?: string | null, authorizationHeader?: string | null } | null,
  config: { URL: string }
}
```

HTTP methods requested: GET, POST, PATCH, etc.

## Intended outcome

One shared agent form, composed from small components, where each tool has a
type choice (HTTP request or MCP server) and the fields for that type.

## Acceptance criteria

- AC1 Each tool in the builder has a tool type choice (HTTP request, MCP
  server). Switching type swaps the type-specific fields and keeps the shared
  ones (name, options, credentials, URL).
- AC2 HTTP tools: method, URL, payload (POST only), API key, Authorization
  header, retries, timeout. GET and POST are selectable. PUT, PATCH and DELETE
  are shown but disabled as "not supported yet", because the API refuses them.
- AC3 MCP tools: server URL, optional description, API key, Authorization
  header, retries and timeout. The helper text says retries apply to the
  connection only and the timeout applies to each tool call.
- AC4 Both types are validated in the browser against the contract rules: name
  pattern and uniqueness, public http(s) URL (same SSRF guard as HTTP),
  retries 0 to 5, timeout 100 to 60000 ms, description at most 1000 characters,
  credentials at most 4096 characters and never the `********` placeholder.
- AC5 Creating an agent with only HTTP tools sends exactly the same body as
  before this change (the live `POST /agents/{user_sso}` contract).
- AC6 Creating an agent with an MCP tool sends no request and shows on that
  tool that MCP servers cannot be saved until the API supports them.
- AC7 The edit page uses the same form, read-only. Stored credentials are never
  copied into inputs; a field with a stored credential says so instead.
- AC8 The form uses the existing CSS variables and utility classes in
  `fe/src/styles.css` and the installed shadcn components. No new colours.
- AC9 `vitest`, `tsc --noEmit` and `biome check` pass in `fe/`; the Playwright
  demo flow and accessibility specs are updated for the new controls.

## Out of scope

- Saving changes on the edit page (the teammate is deciding; no update endpoint
  exists).
- Backend changes. The connectors work in `api/src/app/api/api/` is not wired
  into the running API, and this change does not wire it.
- Visual redesign beyond what is needed to represent the two tool types.

## Unresolved (marked `TODO(spec)` in code)

- The generic HTTP `credentials` and `config` shape. The task leaves it as
  `JSON` / `{...}`. The live API takes the flat HTTP contract, so the form keeps
  sending that.
- Whether HTTP tools get a `description` (the task only lists it for MCP).
- HTTP methods beyond GET and POST (needs backend support).
- Submitting MCP tools (needs the connectors API) and per-agent `allowedTools`
  for MCP (connectors spec AC5).
