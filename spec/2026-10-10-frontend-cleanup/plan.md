# Plan: Remove unused features and technical debt from the frontend

Feature: `spec/2026-10-10-frontend-cleanup/task.md`

## Inventory (2026-10-10, before the change)

Measured with repository searches over `fe/src` and `fe/e2e`:

| Item | Referenced by | Decision |
|---|---|---|
| `.feature-card`, `.nav-link`, `.page-wrap`, `.prose pre`, `.rise-in`, `.site-footer` | nothing | remove |
| `.island-kicker` | `auth-layout.tsx` only (login flow) | remove with the login flow |
| `--chip-line`, `--link-bg-hover`, `--hero-a`, `--hero-b` | nothing | remove |
| `--header-bg` | `.site-footer` only | remove |
| `--bg-base` | a `body` line overridden by the next declaration | remove both |
| `@plugin '@tailwindcss/typography'` | `.prose pre` only | remove plugin and dev dependency |
| `ui/alert`, `ui/badge`, `ui/collapsible`, `ui/select`, `ui/separator`, `ui/sheet`, `ui/slider`, `ui/switch` | no importers | remove |
| `routes/login.tsx`, `components/auth/*`, `lib/api/session.ts`, `useMe`, `useSignIn`, `useSignOut`, `signInInputSchema`, `mocks/demo-account.ts`, `test/session.ts` | login flow | remove; identity from `config/developer-contexts.ts` |
| `routes/_app/security.tsx`, `components/security/*`, `useFindings`, `findingSchema`, `GET /security/findings` (mock), `untrustedDestinationReason`, monitor kill in `mocks/state.ts`, `flagged`, `finding_id` | Security page | remove |
| Security entry in `config/app-navigation.ts`, "Sign out" in `sidebar/nav-user.tsx`, `onLoggedOut` prop chain | login and Security | remove |

## Design

- `lib/api/identity.ts` exports `getCurrentUser()` (the configured developer
  identity, `VITE_DEV_USER_SSO` or `DEFAULT_DEV_USER_SSO`) and `setCurrentUser()` as
  a seam for tests and a future identity switcher. The client always sends the header.
- `_app.tsx` no longer redirects; it resolves the identity and passes it to the shell.
- `run-view.tsx` shows a generic error notice when a run carries an error, with no
  findings lookup.
- The mock keeps the run lifecycle (queued, running, succeeded) and drops the kill
  path; the seed keeps the uptime agent with a completed run and the DevRev agent.

## Steps (test-first)

1. Update and delete tests to describe the smaller system; observe red.
2. Remove the code, CSS, primitives, and dependency; observe green.
3. Update `README.md` in `fe/`, the frontend dashboard spec's plan, and this record.

## Validation

`npm run check`, `npm run typecheck`, `npm test`, then `npm run test:e2e`, run one
after the other; a real-browser smoke of the running dev server; the searches in AC2
and AC3 of the task.
