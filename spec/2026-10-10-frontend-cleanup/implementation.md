# Implementation record: Remove unused features and technical debt from the frontend

Feature: `spec/2026-10-10-frontend-cleanup/task.md`
Status: complete, awaiting commit (2026-10-10)

## Progress log

- 2026-10-10: inventory taken (see `plan.md`); task and plan written.
- 2026-10-10: tests rewritten first. The sign-in and findings tests were deleted; the
  client, queries, schemas, http-contract, seed, run view, agent list, app shell tests
  and both Playwright specs now describe the smaller system (`actAs()` from
  `test/identity.ts` replaces `signInAs()`).
- 2026-10-10: login flow removed: `routes/login.tsx`, `components/auth/*`,
  `lib/api/session.ts`, `useMe`, `useSignIn`, `useSignOut`, `signInInputSchema`,
  `mocks/demo-account.ts`, `test/session.ts`, the per-request header override in the
  client, the "Sign out" menu item and the `onLoggedOut` prop chain. Added
  `lib/api/identity.ts`; `_app.tsx` resolves the identity instead of redirecting.
- 2026-10-10: Security page removed: `routes/_app/security.tsx`,
  `components/security/*`, `useFindings`, `findingSchema`, the findings mock endpoint
  and state, `untrustedDestinationReason`, the mock's run-time kill, the `flagged` and
  `finding_id` fields, the `security` run-event type, the Flagged badge, the flagged
  notice, the findings banner, the Security nav entry, the rogue seed agent and fixture.
- 2026-10-10: unused CSS removed (`.prose pre`, `.page-wrap`, `.feature-card`,
  `.island-kicker`, `.nav-link`, `.rise-in`, `.site-footer`; variables `--bg-base`,
  `--header-bg`, `--chip-line`, `--link-bg-hover`, `--hero-a`, `--hero-b`), with the
  `@tailwindcss/typography` plugin and dependency, the unused `APP_BRANDING.kicker`, and
  the shadcn primitives `alert`, `badge`, `collapsible`, `select`, `slider`, `switch`.
- 2026-10-10: `routeTree.gen.ts` regenerated; `fe/README.md` and the dashboard plan's
  layout, architecture, contract and steps updated.

- 2026-10-10 (evening): merged `main`, which meanwhile wired the dashboard to the
  real connectors and executions API (`spec/2026-10-10-frontend-backend-integration`)
  on top of the old login/security code. Resolution: the API layer, mock, list and
  run view were taken from `main` and this cleanup re-applied on top (identity from
  configuration, no sign-in, no findings/flagged/`security` events, no mock run-time
  monitor, the Security route and its test deleted again). The mock now keeps
  `result.tool_calls` when a run completes so the run page's tool-call panel has
  something to show. Tests from both sides were reconciled (connector ids in
  `configurations.primitives`, `invalid_connector` errors, `timed_out` status).

## Decisions

- Identity is a module-level value (`getCurrentUser()`) read from `VITE_DEV_USER_SSO`,
  falling back to `DEFAULT_DEV_USER_SSO = "admin"`, which lives in
  `config/developer-contexts.ts` next to the admin display preset. `setCurrentUser` and
  `resetCurrentUser` are the seam for tests and a future identity switcher. Nothing is
  stored in the browser any more.
- `ui/separator` and `ui/sheet` stay: the inventory had missed that `ui/sidebar.tsx`
  imports them with an explicit `.tsx` extension.
- `api.postVoid`, `api.delete` and the mock's cancel and delete handlers stay: they are
  the plumbing for the Stop and Delete actions the table currently stubs.
- The `killed` and `cancelled` run statuses stay in the contract. The run page shows one
  error notice for any terminal run that carries an error, titled by status.
- The account menu keeps its dropdown but only shows the identity details now; the
  sidebar owner may prefer a static block.
- The axe scans keep excluding `aside` (the sidebar), as before.
- Left alone: Biome reports a pre-existing info that `biome.json` targets schema 2.2.4
  while the CLI is 2.4.5 (`biome migrate` fixes it; the config belongs to the backend
  owner).

## Test results (2026-10-10)

- `npm run check`: 86 files, no errors (1 pre-existing info, see above).
- `npm run typecheck`: pass.
- `npm test`: 17 files, 83 tests pass (before: 19 files, 98 tests).
- `npm run test:e2e`: 2 passed (demo flow; WCAG 2.1 AA scans of the list, builder,
  detail and run pages).
- Acceptance searches (AC2): `signIn`, `SessionUser`, `findings`, `flagged`, `/login`,
  `/security` in `fe/src` and `fe/e2e` match only the negative assertion in
  `app-shell.test.tsx`. AC3: every class left in `styles.css` (`display-title`,
  `island-shell`, `table-panel`) and every file in `src/components/ui` has a user.
- Browser smoke of the running `dev:mock` server (Playwright Chromium against port
  3000): `/` lands on `/agents`; list, detail and builder render; `/login` answers 404;
  0 console or page errors.

## Deviations and limitations

- None from the plan.
