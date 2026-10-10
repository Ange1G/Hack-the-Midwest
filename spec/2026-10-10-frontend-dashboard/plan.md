# Plan: Frontend dashboard skeleton

Feature: `spec/2026-10-10-frontend-dashboard/task.md`
Branch: `feat/frontend-dashboard`

## Existing state (inspected 2026-10-10)

- `fe/` is a TanStack Start scaffold: file-based router, Nitro server, React Compiler,
  Biome, TanStack Form, shadcn/ui (new-york style, zinc base), Tailwind 4, zod 4.
- One route (`/`) with placeholder content. Palette tokens live in `fe/src/styles.css`.
- Path alias `#/*` maps to `src/*` through the package.json `imports` field.
- Not present: TanStack Query, any test tooling, any API layer, any app components.
- Backend (`api/`, merged from `main` later the same day): FastAPI with a response
  envelope, `/api/v1` prefix, development auth header, and `GET /api/v1/agents/{user_sso}`.
  See `spec/2026-10-10-fastapi-agents-scaffold/`.

## Layout proposal

Shell: a left sidebar with the product name, primary nav (Agents, Security), and a user
menu with sign out at the bottom. A top bar carries the page title and the page's
primary action. Content sits in a max-width container. All colours come from the
existing palette tokens so restyling is a CSS-only job. The navigation bar's styling is
owned by the backend owner.

Pages:

| Route | Content |
|---|---|
| `/login` | Centered card: development sign-in with the SSO id the API should trust. |
| `/agents` | Agent list (TanStack Table): title, tool chips, last run status badge, flagged marker. "New agent" action. Empty state with the same action. |
| `/agents/new` | Builder: name, instructions, tool picker (checklist of tool definitions with per-tool config and credential inputs). |
| `/agents/$agentId` | Header with title, Run button. Tabs: Overview (instructions, tools) and Runs (history table). |
| `/runs/$runId` | Status header with a queued, started, finished timeline. Output panel. Event log. Killed banner with the finding when applicable. |
| `/security` | Findings table with severity badges and links to the run and the agent. |

## Architecture

```text
fe/src/
  routes/
    __root.tsx
    index.tsx               redirect to /agents
    login.tsx
    _app.tsx                authenticated layout, client-only, sidebar shell, session guard
    _app/agents/index.tsx, new.tsx, $agentId.tsx
    _app/runs/$runId.tsx
    _app/security.tsx
  components/ui/            shadcn primitives
  components/               AppShell, PageHeader, DataTable, ToneBadge, Notice, StatusBadge,
                            states (Loading/Empty/Error), auth/, agents/, runs/, security/
  lib/api/
    client.ts               fetch wrapper: base URL, identity header, envelope unwrapping,
                            zod parse, ApiError
    schemas.ts              zod schemas and inferred types (the contract)
    session.ts              development identity (X-Dev-User-SSO) kept in sessionStorage
    queries.ts              query keys and hooks
  mocks/
    handlers.ts             MSW handlers mirroring the backend contract plus proposed endpoints
    state.ts                in-memory state, run lifecycle, deterministic security rule
    seed.ts, demo-account.ts, browser.ts, server.ts
  test/
    setup.ts, render.tsx, query.tsx, session.ts
```

State: server state in TanStack Query, form state in TanStack Form, UI state local. No
global store.

Data flow: components call hooks from `queries.ts`; hooks call `client.ts`; the client
adds the identity header, unwraps the envelope, parses `data` with the schema for that
endpoint, and throws `ApiError` from the envelope's `error` on non-2xx. In mock mode MSW
intercepts the same fetch calls, so the client code under test is the code that ships.

## API contract v1 (aligned with the backend on 2026-10-10)

Source of truth for what exists: `api/src/app` and `api/tests/integration`. Rows marked
*proposed* are what the frontend and the mock expect for endpoints the backend has not
built yet; they follow the backend's conventions so they can be adopted as is or
amended here first.

Conventions (from the backend):

- Base path `/api/v1` (`VITE_API_URL`, default `http://localhost:8000/api/v1`).
- Every response is `{ "data": T | null, "error": ApiError | null, "metadata": { "request_id" }, "pagination": Pagination | null }`.
- Errors: `error.code` in `unauthorized` (401), `forbidden` (403), `not_found` (404),
  `validation_error` (422, `details.errors` holds pydantic issues with `loc` and `msg`),
  `http_error` otherwise.
- Development auth: header `X-Dev-User-SSO: <user_sso>`. Paths that embed `{user_sso}`
  must match the header or the API returns 403.
- Lists take `page` (default 1) and `page_size` (default 20, max 100) and return
  `pagination: { page, page_size, total_items, total_pages }`.

| Method | Path | Body | Response `data` | Status |
|---|---|---|---|---|
| GET | `/agents/{user_sso}?page&page_size` | | `Agent[]` + pagination | implemented |
| POST | `/agents/{user_sso}` | `AgentInput` | `Agent` (201) | proposed |
| GET | `/agents/{user_sso}/{agent_id}` | | `Agent` | proposed |
| DELETE | `/agents/{user_sso}/{agent_id}` | | 204 | proposed |
| GET | `/agents/{user_sso}/{agent_id}/runs?page&page_size` | | `Run[]` + pagination | proposed |
| POST | `/agents/{user_sso}/{agent_id}/runs` | | `Run` with status `queued` (202) | proposed |
| GET | `/runs/{run_id}` | | `Run` | proposed |
| GET | `/runs/{run_id}/events` | | `RunEvent[]` | proposed |
| POST | `/runs/{run_id}/cancel` | | `Run` | proposed |
| GET | `/security/findings?agent_id&run_id` | | `Finding[]` | proposed |
| GET | `/tools` | | `ToolDefinition[]` | proposed |

```ts
type Agent = {                       // AgentRead in the backend
  id: string                         // uuid
  title: string
  system_prompt: string
  configurations: { tools: ToolConfig[] }   // JSONB; see the convention below
  schedule_month: number | null
  schedule_day: number | null
  schedule_time: string | null       // "HH:MM:SS"
  owner_user_sso: string
  created_at: string
  updated_at: string
  // Not in the backend yet. The mock provides them; the frontend defaults them
  // (false, null) when absent so the real API works today.
  flagged?: boolean
  last_run?: { id: string; status: RunStatus; created_at: string } | null
}

type ToolKind = "http.get" | "http.post" | "db.query" | "mcp"
type ToolConfig = { kind: ToolKind; config: Record<string, string> }

type AgentInput = {                  // proposed body for POST /agents/{user_sso}
  title: string
  system_prompt: string
  configurations: { tools: ToolConfig[] }
  credentials?: { tool: ToolKind; values: Record<string, string> }[]
  // write-only: must be stored in a secret store, never inside configurations
}

type ToolDefinition = {
  kind: ToolKind
  name: string
  description: string
  config_fields: { key: string; label: string; type: "text" | "url" | "textarea"; required: boolean }[]
  credential_fields: { key: string; label: string }[]
}

type RunStatus = "queued" | "running" | "succeeded" | "failed" | "killed" | "cancelled"
type Run = { id; agent_id; status: RunStatus; output: string | null; error: string | null;
             finding_id: string | null; created_at; started_at: string | null; finished_at: string | null }
type RunEvent = { id; run_id; ts; type: "log" | "tool_call" | "tool_result" | "security"; message; data: Record<string, unknown> | null }
type Finding = { id; run_id; agent_id; severity: "low" | "medium" | "high" | "critical"; rule; message; action: "flagged" | "killed"; created_at }
```

`configurations.tools` convention: the backend keeps `configurations` as untyped JSON
and lists "typed Pydantic models for configurations" as a follow-up. The frontend reads
and writes `configurations.tools` as `ToolConfig[]` and ignores anything it cannot
parse (an agent with other content renders with no tools rather than failing). This is
the shape proposed for that follow-up.

Mock security rule (deterministic, mirrors the constitution's "enforce deterministically
where possible"): a run is killed when any HTTP tool config targets a private or
metadata address (`169.254.169.254`, `localhost`, `127.0.0.1`, `10.*`, `192.168.*`).
The mock emits a `security` event, sets the run to `killed`, creates a `critical`
finding with rule `ssrf.metadata_endpoint`, and marks the agent `flagged`.

## Implementation steps

Each step is test-first and ends in a commit.

0. Spec and tooling: this document, Vitest, Testing Library, jsdom, MSW, Playwright,
   TanStack Query, scripts, configs.
1. API layer: schemas, client, hooks, MSW handlers.
2. Shell and auth: `_app` layout, guard, sign-in.
3. Agents: list, builder, detail.
4. Runs: start, run page with polling, history.
5. Security: findings page, killed state on the run page, flagged marker.
6. Playwright demo-flow test in mock mode.
7. Lint, typecheck, full test run, update `implementation.md`, push.
8. Review round: TanStack Table, contrast-safe badges, automated accessibility scan.
9. Contract alignment with the backend (envelope, base path, identity header, agent
   field names); mock mirrors the backend and extends it with the proposed endpoints.

## Validation strategy

- `npm run typecheck`, `npm run check`, `npm test` after every step.
- `npm run test:e2e` against `npm run dev` with `--mode mock` (demo flow and WCAG AA scans).
- Manual walk of the demo flow in the browser before handing over for styling.

## Risks and unknowns

- Proposed endpoints may land with different paths or shapes; `schemas.ts`,
  `client.ts`, and `queries.ts` are the only files that should need to change.
- Production authentication is undefined on the backend; the development identity
  header is the only mechanism today.
