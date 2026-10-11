# Task: Frontend dashboard skeleton for the MVP demo flow

Branch: `feat/frontend-dashboard`
Date: 2026-10-10
Owner: frontend (Angel), skeleton built by Claude, styling by Angel

See `AGENTS.md` for the project constitution. This document does not repeat it.

## Problem

The repository has a constitution and a bare TanStack Start scaffold with one placeholder
page. A user cannot sign in, build an agent, run it, or see what the security monitor
found. (The constitution's "monitoring jobs or agents" are called the watchdog below.)
The Hack Midwest demo on 2026-10-11 at 09:00 needs a working click-through of exactly
that flow.

## Intended outcome

A working frontend for the MVP vertical slice (constitution "MVP scope" items 1 to 7),
built against the backend's API contract so the two can be developed in parallel and the
real endpoints can replace the mock without UI changes.

## Demo flow the judges watch

1. Sign in.
2. Create an agent: name, plain-English instructions, pick tools (HTTP GET, HTTP POST,
   database query, MCP connector such as DevRev), supply credentials.
3. Run it. Status moves queued, running, succeeded, with a live event log and output.
4. A second, deliberately rogue agent (its HTTP tool targets the cloud metadata address)
   runs and is flagged and killed by the watchdog. The finding shows on the run page and
   on the Security page.

## Functional requirements

- FR1 Sign-in: the backend's development identity (`X-Dev-User-SSO`) until its
  user-authentication feature lands. Sign-in verifies the identity against the API,
  unauthenticated visits to app routes redirect to `/login`, and the current identity is
  visible in the shell. Account creation is out of scope until the backend supports it.
- FR2 Agents: list, create, view detail. The list renders loading, empty, error, and
  success states.
- FR3 Tool picker: choose from platform tool definitions returned by the API. Each tool
  has per-tool config fields. Credential fields are write-only, sent outside
  `configurations`, and never rendered back from API responses.
- FR4 Runs: start a run from agent detail. The run page shows status, output, error, and
  an event log, and polls while the run is queued or running. Agent detail shows run
  history.
- FR5 Security: a findings list with severity, rule, message, and action. A run killed by
  the watchdog renders a prominent killed state with its finding. Flagged agents are
  marked in the agent list.
- FR6 API layer: one typed client that adds the identity header, unwraps the backend's
  envelope, validates `data` with zod, and maps the envelope's `error` to a structured
  `ApiError`. Base URL from `VITE_API_URL`.
- FR7 Mock mode: with `VITE_USE_MOCKS=true`, Mock Service Worker serves the contract in
  the browser and in Vitest with enough in-memory state to run the demo flow end to end.
  Development and test only. It must not ship in a production build.

## Non-functional requirements

- Strict TypeScript. No `any`.
- Accessible: semantic markup, every input labelled, keyboard-navigable nav and forms,
  WCAG 2.1 AA contrast verified by an automated scan.
- The development identity is an identifier, not a secret; it is kept in
  `sessionStorage` and cleared on sign-out. No tokens or secrets in `localStorage`.
- Client-side validation is a usability feature only. The server is the authority.

## Constraints

- Stack per `AGENTS.md`: React, TypeScript, TanStack Start, Router, Form, Query, and
  Table, shadcn/ui, Tailwind 4, Biome. Tests with Vitest, React Testing Library,
  Playwright.
- Test-driven: red, green, refactor for each unit of behaviour.
- The frontend implements no backend behaviour. The mock exists only to unblock.
- New runtime dependencies: `@tanstack/react-query`, `@tanstack/react-table`.
  Everything else is a dev dependency.

## Out of scope

Account creation, scheduling UI, settings and profile pages, editing an agent beyond
its basic fields, a UI for sharing connectors between users (DevRev reuse is shown via
the tool picker), WebSockets or SSE (polling is sufficient for the demo), dark-mode
polish, pagination controls (lists request one bounded page).

## Acceptance criteria

- AC1 `npm run typecheck`, `npm run check`, and `npm test` pass.
- AC2 An unauthenticated visit to `/agents` redirects to `/login`. After sign-in,
  `/agents` renders the list.
- AC3 Submitting the builder with an empty name shows a validation error and makes no
  API call. A valid submit posts an `AgentInput` and navigates to the new agent's page.
- AC4 The run page renders queued, running, and succeeded from successive polled
  responses, and renders the event log.
- AC5 A run killed by the watchdog renders the killed state with its finding, and the
  Security page lists the same finding.
- AC6 A Playwright test walks the full demo flow in mock mode and passes.
- AC7 Every list view renders loading, empty, error, and success states.
- AC8 The automated WCAG 2.1 AA scan reports no serious or critical violation on any
  screen in the demo flow (navigation bar excluded, owned separately).

## Required tests

- Unit: API client (envelope, identity header, error mapping), schemas, form
  validation, status badge mapping, polling decision, data table sorting.
- Integration (Testing Library + MSW): sign-in flow, agents list states, builder
  submit, run page polling, security findings.
- End to end (Playwright): the demo flow in mock mode; accessibility scans.

## Security, failure, and compatibility considerations

- Authenticated routes render client-only so the session check and the mock worker
  behave the same on first load and on navigation.
- Every query and mutation has an explicit error state with a retry.
- Credential inputs are write-only and travel outside `configurations`, which the
  backend stores as JSON. Responses never echo them.
- Cross-user isolation is enforced server-side (403 on an SSO mismatch). The UI only
  ever requests its own identity's resources.

## Open decisions for the backend owner

- Paths and shapes of the endpoints marked *proposed* in `plan.md`, in particular
  `POST /agents/{user_sso}`, agent-by-id, runs, events, findings, and tools.
- The `configurations.tools` convention and where write-only credentials are stored.
- Whether the monitoring agents (findings, killed runs) are in scope for the demo.
- Polling interval (assumed 1.5 s) versus server-sent events.
