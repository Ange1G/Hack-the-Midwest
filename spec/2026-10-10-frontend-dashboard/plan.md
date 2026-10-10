# Plan: Frontend dashboard skeleton

Feature: `spec/2026-10-10-frontend-dashboard/task.md`
Branch: `feat/frontend-dashboard`

## Existing state (inspected 2026-10-10)

- `fe/` is a TanStack Start scaffold: file-based router, Nitro server, React Compiler,
  Biome, TanStack Form, shadcn/ui (new-york style, zinc base), Tailwind 4, zod 4.
- One route (`/`) with placeholder content. Palette tokens live in `fe/src/styles.css`.
- Path alias `#/*` maps to `src/*` through the package.json `imports` field.
- Not present: TanStack Query, any test tooling, any API layer, any app components.

## Layout proposal

Shell: a left sidebar with the product name, primary nav (Agents, Security), and a user
menu with logout at the bottom. A top bar carries the page title and the page's primary
action. Content sits in a max-width container. All colours come from the existing palette
tokens so restyling is a CSS-only job.

Pages:

| Route | Content |
|---|---|
| `/login`, `/signup` | Centered card with the form. |
| `/agents` | Agent list: name, tool chips, last run status badge, flagged marker. "New agent" action. Empty state with the same action. |
| `/agents/new` | Builder: name, instructions, tool picker (checklist of tool definitions with per-tool config and credential inputs), summary column. |
| `/agents/$agentId` | Header with name, status, Run button. Tabs: Overview (instructions, tools) and Runs (history table). |
| `/runs/$runId` | Status header with a queued, running, finished timeline. Output panel. Event log. Killed banner with the finding when applicable. |
| `/security` | Findings table with severity badges, filterable by agent. |

shadcn components to add: card, badge, table, tabs, dialog, dropdown-menu, separator,
skeleton, sonner, checkbox, scroll-area, alert.

## Architecture

```text
fe/src/
  routes/
    __root.tsx
    index.tsx               redirect to /agents
    login.tsx, signup.tsx
    _app.tsx                authenticated layout, client-only, sidebar shell, auth guard
    _app/agents/index.tsx, new.tsx, $agentId.tsx
    _app/runs/$runId.tsx
    _app/security.tsx
  components/ui/            shadcn primitives
  components/               AppSidebar, PageHeader, StatusBadge, ToolPicker, RunEventLog,
                            FindingCard, EmptyState, ErrorState
  lib/api/
    client.ts               fetch wrapper: base URL, credentials include, JSON, zod parse, ApiError
    schemas.ts              zod schemas and inferred types (the contract)
    queries.ts              query keys and hooks
  mocks/
    handlers.ts             MSW handlers with in-memory state and a simulated run lifecycle
    browser.ts, server.ts
  test/
    setup.ts                jest-dom matchers, MSW server lifecycle
    render.tsx              render helper with QueryClient and a memory router
```

State: server state in TanStack Query, form state in TanStack Form, UI state local. No
global store.

Data flow: components call hooks from `queries.ts`; hooks call `client.ts`; the client
parses every response with the schema for that endpoint and throws `ApiError` on
non-2xx. In mock mode MSW intercepts the same fetch calls, so the client code under test
is the code that ships.

## API contract v0 (proposed)

The frontend builds to this until an OpenAPI document exists. Backend owner: please
confirm or amend here before diverging.

Conventions: JSON bodies, `credentials: "include"`, errors as
`{ "error": { "code": string, "message": string, "fields"?: Record<string, string> } }`,
collections as `{ "items": T[] }`, timestamps ISO 8601, ids opaque strings.

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/signup` | `{ email, password }` | 201 `User`, sets cookie |
| POST | `/auth/login` | `{ email, password }` | 200 `User`, sets cookie |
| POST | `/auth/logout` | | 204 |
| GET | `/auth/me` | | 200 `User` or 401 |
| GET | `/tools` | | `{ items: ToolDefinition[] }` |
| GET | `/agents` | | `{ items: Agent[] }` |
| POST | `/agents` | `AgentInput` | 201 `Agent` |
| GET | `/agents/{id}` | | `Agent` |
| DELETE | `/agents/{id}` | | 204 |
| GET | `/agents/{id}/runs` | | `{ items: Run[] }` |
| POST | `/agents/{id}/runs` | | 202 `Run` with status `queued` |
| GET | `/runs/{id}` | | `Run` |
| GET | `/runs/{id}/events` | | `{ items: RunEvent[] }` |
| POST | `/runs/{id}/cancel` | | 200 `Run` |
| GET | `/security/findings?agent_id=&run_id=` | | `{ items: Finding[] }` |

```ts
type User = { id: string; email: string; created_at: string }

type ToolKind = "http.get" | "http.post" | "db.query" | "mcp"

type ToolDefinition = {
  kind: ToolKind
  name: string
  description: string
  config_fields: { key: string; label: string; type: "text" | "url" | "textarea"; required: boolean }[]
  credential_fields: { key: string; label: string }[]
}

type ToolConfig = {
  kind: ToolKind
  config: Record<string, string>
  credentials?: Record<string, string>   // write-only: accepted on input, never returned
}

type AgentInput = { name: string; instructions: string; tools: ToolConfig[] }

type Agent = {
  id: string
  name: string
  instructions: string
  tools: Omit<ToolConfig, "credentials">[]
  status: "active" | "disabled"
  flagged: boolean
  last_run: { id: string; status: RunStatus; created_at: string } | null
  created_at: string
  updated_at: string
}

type RunStatus = "queued" | "running" | "succeeded" | "failed" | "killed" | "cancelled"

type Run = {
  id: string
  agent_id: string
  status: RunStatus
  output: string | null
  error: string | null
  finding_id: string | null          // set when status is killed
  created_at: string
  started_at: string | null
  finished_at: string | null
}

type RunEvent = {
  id: string
  run_id: string
  ts: string
  type: "log" | "tool_call" | "tool_result" | "security"
  message: string
  data: Record<string, unknown> | null
}

type Finding = {
  id: string
  run_id: string
  agent_id: string
  severity: "low" | "medium" | "high" | "critical"
  rule: string                       // e.g. "ssrf.metadata_endpoint"
  message: string
  action: "flagged" | "killed"
  created_at: string
}
```

Mock watchdog rule (deterministic, mirrors the constitution's "enforce deterministically
where possible"): a run is killed when any HTTP tool config targets a private or
metadata address (`169.254.169.254`, `localhost`, `127.0.0.1`, `10.*`, `192.168.*`).
The mock emits a `security` event, sets the run to `killed`, creates a `critical`
finding with rule `ssrf.metadata_endpoint`, and marks the agent `flagged`.

## Implementation steps

Each step is test-first and ends in a commit.

0. Spec and tooling: this document, Vitest, Testing Library, jsdom, MSW, Playwright,
   TanStack Query, scripts, configs.
1. API layer: schemas, client, hooks, MSW handlers.
2. Shell and auth: `_app` layout, guard, login and signup.
3. Agents: list, builder, detail.
4. Runs: start, run page with polling, history.
5. Security: findings page, killed state on the run page, flagged marker.
6. Playwright demo-flow test in mock mode.
7. Lint, typecheck, full test run, update `implementation.md`, push.

## Validation strategy

- `npm run typecheck`, `npm run check`, `npm test` after every step.
- `npm run test:e2e` against `npm run dev` with `VITE_USE_MOCKS=true`.
- Manual walk of the demo flow in the browser before handing over for styling.

## Risks and unknowns

- Vitest compatibility with Vite 8. Verify at install.
- The exact option name for client-only rendering of a route in the installed TanStack
  Start version. Verify against the installed types.
- Contract drift once the backend lands. Schemas live in one file so adapting is local.
