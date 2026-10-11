# Plan: Frontend dashboard skeleton

Feature: `spec/2026-10-10-frontend-dashboard/task.md`
Branch: `feat/frontend-dashboard`

## Existing state (inspected 2026-10-10)

- `fe/` is a TanStack Start scaffold: file-based router, Nitro server, React Compiler,
  Biome, TanStack Form, shadcn/ui (new-york style, zinc base), Tailwind 4, zod 4.
- One route (`/`) with placeholder content. Palette tokens live in `fe/src/styles.css`.
- Path alias `#/*` maps to `src/*` through the package.json `imports` field.
- Not present: TanStack Query, any test tooling, any API layer, any app components.
- Backend (`api/`): FastAPI with a response envelope, `/api/v1` prefix, development
  auth header, `GET /api/v1/agents/{user_sso}` (on `main`) and
  `POST /api/v1/agents/{user_sso}` with typed configurations and encrypted credentials
  (branch `feat/agent_create_http`, see `spec/2026-10-10-agent-create-http-contract/`).

## Layout proposal

Shell: a left sidebar with the product name, primary nav (Agents), and an account
menu at the bottom. A top bar carries the page title and the page's
primary action. Content sits in a max-width container. All colours come from the
existing palette tokens so restyling is a CSS-only job. The navigation bar's styling is
owned by the backend owner.

Pages:

| Route | Content |
|---|---|
| `/agents` | Agent list (TanStack Table): title, HTTP call chips, last run status badge. "New agent" action. Empty state with the same action. |
| `/agents/new` | Builder: name, instructions, HTTP calls (name, method, URL, payload, credentials, retries, timeout), schedule (days, times, month). |
| `/agents/$agentId` | Header with title, Run button. Tabs: Overview (instructions, HTTP calls, schedule) and Runs (history table). |
| `/runs/$runId` | Status header with a queued, started, finished timeline. Output panel. Event log. Error notice for failed, terminated, or cancelled runs. |

## Architecture

```text
fe/src/
  routes/
    __root.tsx
    index.tsx               redirect to /agents
    _app.tsx                application layout, client-only, sidebar shell, developer identity
    _app/agents/index.tsx, new.tsx, $agentId.tsx
    _app/runs/$runId.tsx
  components/ui/            shadcn primitives
  components/               AppShell, PageHeader, DataTable, ToneBadge, Notice, StatusBadge,
                            states (Loading/Empty/Error), agents/, runs/
  lib/
    http-contract.ts        the team's HTTP contract rules (URL safety, limits, time helpers)
    api/client.ts           fetch wrapper: base URL, identity header, envelope unwrapping,
                            zod parse, ApiError with per-field messages
    api/schemas.ts          zod schemas and inferred types (the contract)
    api/identity.ts         development identity (X-Dev-User-SSO) from configuration
    api/queries.ts          query keys and hooks
  mocks/
    handlers.ts             MSW handlers mirroring the backend contract plus proposed endpoints
    state.ts                in-memory state, run lifecycle
    seed.ts, browser.ts, server.ts
  test/
    setup.ts, render.tsx, query.tsx, identity.ts, fixtures.ts
```

State: server state in TanStack Query, form state in TanStack Form plus local state for
the dynamic HTTP-call drafts, UI state local. No global store.

Data flow: components call hooks from `queries.ts`; hooks call `client.ts`; the client
adds the identity header, unwraps the envelope, parses `data` with the schema for that
endpoint, and throws `ApiError` from the envelope's `error` on non-2xx. In mock mode MSW
intercepts the same fetch calls, so the client code under test is the code that ships.

## API contract v2 (aligned with the backend and the team spec, 2026-10-10)

Source of truth for what exists: `api/src/app` and `api/tests`. Rows marked *proposed*
are what the frontend and the mock expect for endpoints the backend has not built yet;
they follow the backend's conventions so they can be adopted as is or amended here
first.

Conventions (from the backend):

- Base path `/api/v1` (`VITE_API_URL`, default `http://localhost:8000/api/v1`).
- Every response is `{ "data": T | null, "error": ApiError | null, "metadata": { "request_id" }, "pagination": Pagination | null }`.
- Errors: `error.code` in `unauthorized` (401), `forbidden` (403), `not_found` (404),
  `validation_error` (422, pydantic issues in `details.errors[]` with `loc` and `msg`),
  `invalid_configuration` (422, `details.errors[]` with `field` and `message`, never the
  submitted value), `secret_storage_unavailable` (503), `http_error` otherwise.
- Development auth: header `X-Dev-User-SSO: <user_sso>`. Paths that embed `{user_sso}`
  must match the header or the API returns 403.
- Lists take `page` (default 1) and `page_size` (default 20, max 100) and return
  `pagination: { page, page_size, total_items, total_pages }`.
- Request bodies and `configurations` are camelCase (team spec); `AgentRead` and the
  envelope are snake_case.

| Method | Path | Body | Response `data` | Status |
|---|---|---|---|---|
| GET | `/agents/{user_sso}?page&page_size` | | `Agent[]` + pagination | implemented |
| POST | `/agents/{user_sso}` | `AgentInput` | `Agent` (201) | implemented on `feat/agent_create_http` |
| GET | `/agents/{user_sso}/{agent_id}` | | `Agent` | proposed |
| DELETE | `/agents/{user_sso}/{agent_id}` | | 204 | proposed |
| GET | `/agents/{user_sso}/{agent_id}/runs?page&page_size` | | `Run[]` + pagination | proposed |
| POST | `/agents/{user_sso}/{agent_id}/runs` | | `Run` with status `queued` (202) | proposed |
| GET | `/runs/{run_id}` | | `Run` | proposed |
| GET | `/runs/{run_id}/events` | | `RunEvent[]` | proposed |
| POST | `/runs/{run_id}/cancel` | | `Run` | proposed |

```ts
// HTTP contract (team spec). Field names are the wire names.
type HttpContract = {
  contractVersion: 1
  method: "GET" | "POST"
  URL: string                        // http/https; private, loopback, link-local, metadata and
                                     // internal hostnames are refused at save time
  payload?: unknown                  // JSON; not allowed with GET
  xApiKey?: string                   // credential: encrypted at rest, returned as "********"
  authorizationHeader?: string       // credential: same handling
  options?: { retries?: number /* 0..5 */; timeout?: number /* 100..60000 ms */ }
}

type AgentConfigurations = {
  primitives: Record<string, HttpContract>   // names match ^[a-z][a-z0-9_]{0,63}$, at most 20
  month?: number | null                      // 1..12
  dayOfWeek: number[]                        // 0 = Sunday .. 6 = Saturday
  timeOfDay: number[]                        // minutes after midnight, 540 = 09:00
}

type AgentInput = {                  // POST body; backend also accepts agentTile/title and system_prompt
  agentTitle: string                 // 1..255
  systemPrompt: string               // 1..20000
  configurations: AgentConfigurations
}

type Agent = {                       // AgentRead
  id: string                         // uuid
  title: string
  system_prompt: string
  configurations: AgentConfigurations   // credentials masked; unset fields absent
  schedule_month: number | null      // legacy columns, null for new agents
  schedule_day: number | null
  schedule_time: string | null
  owner_user_sso: string
  created_at: string
  updated_at: string
  // Not in the backend yet. The mock provides it; the frontend defaults it to
  // null when absent so the real API works today.
  last_run?: { id: string; status: RunStatus; created_at: string } | null
}

type RunStatus = "queued" | "running" | "succeeded" | "failed" | "killed" | "cancelled"
type Run = { id; agent_id; status: RunStatus; output: string | null; error: string | null;
             created_at; started_at: string | null; finished_at: string | null }
type RunEvent = { id; run_id; ts; type: "log" | "tool_call" | "tool_result"; message; data: Record<string, unknown> | null }
```

The frontend reads `configurations` leniently: an agent whose stored JSON does not match
the schema renders with no calls and no schedule instead of failing the list.

URL safety is enforced at save time: the builder refuses what the backend refuses
(`unsafeUrlReason`). The mock has no run-time monitor; the findings feature was
removed on 2026-10-10 (see `spec/2026-10-10-frontend-cleanup/`).

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
10. Create contract: HTTP calls, schedule, credential masking, save-time URL refusal,
    the backend's configuration error shape; builder rebuilt as an HTTP-call editor.
11. Cleanup (`spec/2026-10-10-frontend-cleanup/`): login flow, Security page, unused CSS
    and primitives removed; the identity comes from configuration.

## Validation strategy

- `npm run typecheck`, `npm run check`, `npm test` after every step.
- `npm run test:e2e` against `npm run dev` with `--mode mock` (demo flow and WCAG AA scans).
- Manual walk of the demo flow in the browser before handing over for styling.

## Risks and unknowns

- Proposed endpoints may land with different paths or shapes; `schemas.ts`,
  `client.ts`, and `queries.ts` are the only files that should need to change.
- Production authentication is undefined on the backend; the development identity
  header is the only mechanism today.
- The create endpoint is on an unmerged branch awaiting review; if review changes
  the contract, the same three files absorb it.
