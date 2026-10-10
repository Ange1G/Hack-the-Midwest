# Task: Frontend dashboard skeleton for the MVP demo flow

Branch: `feat/frontend-dashboard`
Date: 2026-10-10
Owner: frontend (Angel), skeleton built by Claude, styling by Angel

See `AGENTS.md` for the project constitution. This document does not repeat it.

## Problem

The repository has a constitution and a bare TanStack Start scaffold with one placeholder
page. A user cannot sign up, build an agent, run it, or see what the security monitor
found. (The constitution's "monitoring jobs or agents" are called the watchdog below.) The Hack Midwest demo on 2026-10-11 at 09:00 needs a working click-through of
exactly that flow.

## Intended outcome

A working frontend for the MVP vertical slice (constitution "MVP scope" items 1 to 7),
built against a documented API contract so the backend can be developed in parallel and
swapped in without UI changes.

## Demo flow the judges watch

1. Sign up or log in.
2. Create an agent: name, plain-English instructions, pick tools (HTTP GET, HTTP POST,
   database query, MCP connector such as DevRev), supply credentials.
3. Run it. Status moves queued, running, succeeded, with a live event log and output.
4. A second, deliberately rogue agent (its HTTP tool targets the cloud metadata address)
   runs and is flagged and killed by the watchdog. The finding shows on the run page and
   on the Security page.

## Functional requirements

- FR1 Auth: signup, login, logout. Unauthenticated visits to app routes redirect to
  `/login`. The current user is visible in the shell.
- FR2 Agents: list, create, view detail. The list renders loading, empty, error, and
  success states.
- FR3 Tool picker: choose from platform tool definitions returned by the API. Each tool
  has per-tool config fields. Credential fields are write-only and are never rendered
  back from API responses.
- FR4 Runs: start a run from agent detail. The run page shows status, output, error, and
  an event log, and polls while the run is queued or running. Agent detail shows run
  history.
- FR5 Security: a findings list with severity, rule, message, and action. A run killed by
  the watchdog renders a prominent killed state with its finding. Flagged agents are
  marked in the agent list.
- FR6 API layer: one typed client with zod-validated responses, TanStack Query hooks,
  structured `ApiError`, base URL from `VITE_API_URL`.
- FR7 Mock mode: with `VITE_USE_MOCKS=true`, Mock Service Worker serves the contract in
  the browser and in Vitest with enough in-memory state to run the demo flow end to end.
  Development and test only. It must not ship in a production build.

## Non-functional requirements

- Strict TypeScript. No `any`.
- Accessible: semantic markup, every input labelled, keyboard-navigable nav and forms.
- No auth tokens in `localStorage`. Auth is an httpOnly cookie sent with
  `credentials: "include"` (pending backend confirmation, see open decisions).
- Client-side validation is a usability feature only. The server is the authority.

## Constraints

- Stack per `AGENTS.md`: React, TypeScript, TanStack Start, Router, Form, and Query,
  shadcn/ui, Tailwind 4, Biome. Tests with Vitest, React Testing Library, Playwright.
- Test-driven: red, green, refactor for each unit of behaviour.
- The frontend implements no backend behaviour. The mock exists only to unblock.
- New runtime dependencies: `@tanstack/react-query` only (server-state cache, polling,
  mutation state). Everything else is a dev dependency.

## Out of scope

Scheduling UI, settings and profile pages, editing an agent beyond its basic fields,
a UI for sharing connectors between users (DevRev reuse is shown via the tool picker),
WebSockets or SSE (polling is sufficient for the demo), dark-mode polish.

## Acceptance criteria

- AC1 `npm run typecheck`, `npm run check`, and `npm test` pass.
- AC2 An unauthenticated visit to `/agents` redirects to `/login`. After login, `/agents`
  renders the list.
- AC3 Submitting the builder with an empty name shows a validation error and makes no
  API call. A valid submit calls `POST /agents` and navigates to the new agent's page.
- AC4 The run page renders queued, running, and succeeded from successive polled
  responses, and renders the event log.
- AC5 A run killed by the watchdog renders the killed state with its finding, and the
  Security page lists the same finding.
- AC6 A Playwright test walks the full demo flow in mock mode and passes.
- AC7 Every list view renders loading, empty, error, and success states.

## Required tests

- Unit: API client parsing and error mapping, schemas, form validation, status badge
  mapping, polling decision.
- Integration (Testing Library + MSW): login flow, agents list states, builder submit,
  run page polling, security findings.
- End to end (Playwright): the demo flow in mock mode.

## Security, failure, and compatibility considerations

- Authenticated routes render client-only so the auth check and the mock worker behave
  the same on first load and on navigation.
- Every query and mutation has an explicit error state with a retry.
- Credential inputs are typed as write-only in the contract. Responses never echo them.
- Cross-user isolation is enforced server-side. The UI never sends an owner id.

## Open decisions for the backend owner

- Cookie versus bearer-token auth. Assumed: httpOnly cookie plus CORS with credentials.
- Final endpoint paths and field names. `plan.md` holds the proposed contract and the
  frontend treats it as authoritative until an OpenAPI document exists.
- Polling interval (assumed 1.5 s) versus server-sent events.
