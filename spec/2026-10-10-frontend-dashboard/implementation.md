# Implementation record: Frontend dashboard skeleton

Feature: `spec/2026-10-10-frontend-dashboard/task.md`
Branch: `feat/frontend-dashboard`
Status: skeleton complete, awaiting styling pass and the real API (2026-10-10)

## Progress log

- 2026-10-10 14:30: task and plan written. Tooling installed (step 0): Vitest,
  Testing Library, jsdom, MSW, Playwright, TanStack Query.
- 2026-10-10 15:05: API layer (step 1): zod schemas for contract v0, typed client,
  Query hooks, stateful MSW handlers with the run lifecycle and the security rule.
- 2026-10-10 15:30: shell and auth (step 2): app shell with sidebar, login and
  signup forms, client-only authenticated layout with session guard, mock mode
  wiring (`npm run dev:mock`, `.env.mock`).
- 2026-10-10 15:50: agents, runs, security (steps 3 to 5): agent list, builder with
  tool picker, agent detail with run history, run view with polling, event log and
  killed-state banner, findings list.
- 2026-10-10 16:05: Playwright demo-flow test (step 6) passing in mock mode.
  Lint, typecheck and all tests green (step 7).

## Decisions made during implementation

- **Mock mode is opt-in through a Vite mode**, not an env var in the shell:
  `vite --mode mock` loads `.env.mock` (`VITE_USE_MOCKS=true`). Works on Windows
  without `cross-env`, and Playwright uses the same switch. The MSW worker is
  loaded through a dynamic import guarded by that constant, so production builds
  never bundle it.
- **Authenticated routes are client-only** (`ssr: false` on `_app`, `/login`,
  `/signup`). The session check and the mock worker then behave identically on a
  hard refresh and on in-app navigation. Public SSR is kept for `/`.
- **The run lifecycle in the mock advances on each read**, not on a timer. The UI
  polls every 1.5 s while a run is queued or running, so the demo shows queued,
  running, and a terminal state in about five seconds, and tests drive the same
  code with a 5 ms interval.
- **The security rule in the mock is deterministic** (HTTP tool targets a cloud
  metadata or private address), matching the constitution's requirement that
  critical controls do not depend on an LLM's judgement.
- **Forms**: TanStack Form with zod validators for the simple fields. The tool
  picker holds its own local state because its fields are dynamic per tool
  definition; required-config validation runs on submit before any API call.
- **Mutation callbacks pass only the result on** (`onSuccess: (user) => ...`), not
  the variables. The tests caught the login form forwarding the submitted
  credentials as a second argument.
- **`.gitattributes` pins LF** for the whole repo. Windows checkouts were getting
  CRLF, which made `npm run check` fail on two JSON files that the Mac-side
  scaffold had committed with CRLF. This also keeps Ruff and Biome in agreement
  once the backend lands.
- **Scaffold files were formatted** to the repository's own Biome config (tabs,
  double quotes): the seven original shadcn components, `utils.ts`,
  `vite.config.ts`, `biome.json`, `.vscode/settings.json`. Formatting only, so that
  `npm run check` passes (acceptance criterion AC1). One `biome-ignore` was added in
  `slider.tsx` for a positional key, with the reason in the comment.

## Test results (observed 2026-10-10 16:05, Windows 11, Node 24)

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run check` (Biome, 72 files) | 0 errors, 1 info |
| `npm test` (Vitest) | 12 files, 56 tests, all pass |
| `npm run test:e2e` (Playwright, chromium) | 2 tests, all pass (demo flow 14.7 s) |

Acceptance criteria: AC1 to AC7 all satisfied by the above. AC2, AC3, AC4, AC5 and
AC6 are exercised directly by `e2e/demo-flow.spec.ts` plus the component suites;
AC7 by the list-state tests in `agent-list.test.tsx` and the state handling in each
page component.

## Deviations from the plan

- The plan listed dropdown-menu, dialog, scroll-area and sonner among the shadcn
  components to add. None were needed for the skeleton, so they were not added.
- The builder has a single column rather than a form-plus-summary layout. Styling
  pass may add the summary.
- `useCancelRun` was not implemented: nothing in the demo flow cancels a run. The
  mock still serves `POST /runs/{id}/cancel` so it can be added without contract
  changes.

## Known limitations and follow-ups

- Mock mode stands in for the backend. The contract in `plan.md` is still a
  proposal; once the API exists, `src/lib/api/schemas.ts` and `client.ts` are the
  only files that should need to change for shape or path differences.
- Open decisions for the backend owner remain as listed in `task.md`: cookie
  versus bearer auth, final endpoint shapes, polling versus server-sent events,
  and whether the monitoring agents are in scope for the demo.
- No pagination on the agents, runs, or findings lists yet. The contract returns
  bounded `items` arrays; pagination parameters should be added when the backend
  defines them.
- The agent list and findings list fetch the agent collection a second time to
  resolve names; fine at demo scale, worth a joined response later.
- Visual design is deliberately plain and uses only the palette tokens already in
  `styles.css`, ready for the styling pass.
