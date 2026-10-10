# Implementation record: Frontend dashboard skeleton

Feature: `spec/2026-10-10-frontend-dashboard/task.md`
Branch: `feat/frontend-dashboard`
Status: skeleton complete, revised after backend-owner review, and aligned with the
backend's API contract; awaiting styling pass and the backend's remaining endpoints
(2026-10-10)

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
- 2026-10-10 17:30: review round from the backend owner applied: TanStack Table
  for every data table, contrast-safe badges and notices, an automated WCAG AA
  scan in Playwright, and a check that components use only `:root` variables.
  Root `.gitignore` added; committed artifacts untracked. `main` merged
  (FastAPI agents scaffold).
- 2026-10-10 18:30: contract aligned with the backend (step 9): envelope, `/api/v1`,
  `X-Dev-User-SSO` identity, pagination, backend error codes, and the agent's
  `title` / `system_prompt` / `configurations` fields. Sign-in replaces login and
  signup. The mock mirrors the implemented endpoint exactly and extends it with
  the proposed ones. Tests rewritten first, then the code; all green.

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

## Review round (backend owner feedback, 2026-10-10)

Feedback: use TanStack Table rather than hand-written tables; buttons, badges and
icons must have accessible contrast (check with browser accessibility tooling);
components must use the CSS variables declared on `:root` in `styles.css`; the
navigation bar is styled by the backend owner and is not to be changed.

- **TanStack Table v9** (`@tanstack/react-table`) behind one `DataTable`
  component (`src/components/data-table.tsx`): sortable column headers with
  `aria-sort`, a screen-reader caption, and an empty row. The agents list, the
  agent's run history, and the findings list define plain column objects and
  read values from `row.original`, which keeps the per-column generics simple.
  v9's API differs from v8 (`useTable`, `tableFeatures`, explicit `sortFns`);
  it was read from the installed type definitions, not from memory.
- **Contrast** is checked automatically: `e2e/a11y.spec.ts` runs axe-core (the
  engine behind Lighthouse's accessibility audit) with the WCAG 2.1 AA rule set on
  login, signup, agents list, builder, agent detail, a killed run, and the
  security page, and fails on any serious or critical violation. The navigation
  bar (`aside`) is excluded from the assertion because it is owned elsewhere.
- Findings from the first scan, all fixed: white-on-colour badges fell below
  4.5:1 with this palette (secondary teal 2.5:1, destructive 3.4:1); the global
  `a` colour (`--lagoon-deep`, #328f97) is 3.8:1 on white; and because that
  global rule is unlayered it also overrode the white text inside primary
  buttons rendered as links (teal on violet, 1.7:1). Badges and notices now keep
  text in `--foreground` on a light tint of a `:root` colour (`ToneBadge`,
  `Notice`); app links use `textLinkClass` / `buttonLinkClass` from
  `src/lib/styles.ts`. The global `a` colour itself is reported to the owner of
  `styles.css` rather than changed here.
- **`:root` variables**: a search of `src/components` (excluding `ui/`) for hex
  colours or Tailwind palette classes found none; every colour resolves to a
  variable in `styles.css`, either through the shadcn theme mapping or directly
  via `(--name)` utilities.
- `app-shell.tsx` was not modified in this round.

## Contract alignment (2026-10-10)

Decision: adopt the backend's conventions now and keep the frontend's extra
endpoints as proposals the mock serves until the backend builds them.

- **Client** (`src/lib/api/client.ts`): adds the `X-Dev-User-SSO` header from the
  stored identity, unwraps `{ data, error, metadata, pagination }`, maps the
  envelope's `error` to `ApiError` (including pydantic `details.errors` to
  per-field messages), treats a 2xx with `data: null` as an error, and offers
  `api.list` for paginated collections.
- **Identity** (`src/lib/api/session.ts`): the development SSO id lives in
  `sessionStorage`. Sign-in verifies it with a one-item `GET /agents/{sso}` using
  the header before storing it, so a wrong API URL or a down server surfaces on
  the sign-in form. Sign-out is local; the backend has no session endpoint.
  Signup was removed: the API has no accounts, and a local stand-in would have
  been a fake implementation.
- **Agent shape**: `title`, `system_prompt`, `configurations.tools`,
  schedule fields, `owner_user_sso`. `flagged` and `last_run` default to `false`
  and `null` when absent, so the real list endpoint renders today and the mock
  (and a future backend) can add them. `configurations` that do not match the
  tools convention render as no tools instead of failing the list.
- **Credentials** go in a top-level `credentials` array on create, outside
  `configurations`, so the backend can store them in a secret store rather than
  the agent's JSON. The mock discards them.
- **Lists** request one bounded page (`page_size=100`, the backend's maximum) and
  show "Showing N of M" when more exist. Pagination controls are deferred.
- **Mock** (`src/mocks/handlers.ts`): same paths, envelope, header check, 401/403
  behaviour, pagination defaults (20, max 100), and validation error shape as the
  backend; the proposed endpoints follow the owner-scoped path style
  (`/agents/{sso}/{id}/runs`). Nothing else in the mock pretends to be real.
- Visible labels stay "Name" and "Instructions"; only the data fields changed.
- `app-shell.tsx` changed on one line: it now shows the SSO id instead of an email.

## Test results (observed 2026-10-10 18:30, Windows 11, Node 24)

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run check` (Biome, 77 files) | 0 errors, 1 info |
| `npm test` (Vitest) | 13 files, 66 tests, all pass |
| `npm run test:e2e` (Playwright, chromium) | 4 tests, all pass: demo flow 15.7 s, redirect, two WCAG AA scans across 6 screens |

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

- **Backend coverage.** Only `GET /api/v1/agents/{user_sso}` exists on the
  backend. Against the real API the agents list and sign-in work; creating an
  agent, agent detail, runs, events, findings, and tool definitions still need
  the endpoints marked *proposed* in `plan.md`. Until then those screens work in
  mock mode only.
- **Proposed endpoints may land differently.** `schemas.ts`, `client.ts`, and
  `queries.ts` are the only files that should need to change.
- The global `a` colour in `styles.css` (`--lagoon-deep`) is 3.8:1 on the light
  surfaces; app links override it locally. Raising the token's contrast globally
  is the owner's call.
- Mock mode stands in for the backend. `src/lib/api/schemas.ts` and `client.ts`
  are the only files that should need to change for shape or path differences.
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
