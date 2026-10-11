# Task: Remove unused features and technical debt from the frontend

Branch: `feat/frontend-dashboard`
Date: 2026-10-10
Requested by: backend owner (review feedback), owner: frontend (Angel)

See `AGENTS.md` for the project constitution. This document does not repeat it.

## Problem

The frontend carries features and code that the product no longer uses: a sign-in
flow for an API that identifies callers with a development header, a Security page
for findings that no backend produces, and global CSS classes and UI primitives
nothing references. They cost build size, test time, and reviewer attention.

## Intended outcome

The frontend contains only what the demo and the backend contract use. Identity comes
from a configured developer context instead of a login page. Every remaining module is
imported by something, every CSS class is used, and all checks stay green.

## Scope

Remove:

- The login flow: `/login` route, auth components, sign-in and sign-out hooks, session
  storage, the identity verification request, the "Sign out" menu item.
- The Security page: `/security` route, navigation entry, findings list, findings
  hooks, schema, mock endpoint, the mock's run-time monitor rule, and the `flagged`
  and `finding_id` fields that only existed for it.
- Global CSS classes with no references, the CSS variables that only they used, the
  `@tailwindcss/typography` plugin (only `.prose` used it) and its dependency, and
  shadcn primitives with no importers.

Replace:

- Identity: a `DEFAULT_DEV_USER_SSO` developer context (overridable with
  `VITE_DEV_USER_SSO`) feeds the `X-Dev-User-SSO` header. Tests can act as another
  identity through a small seam.

Keep: the run status vocabulary from the contract (including `killed`), the run page's
error notice for failed runs, the builder's save-time URL refusal (it mirrors the
backend), the accessibility scans, and everything the backend owner's table redesign
added.

## Acceptance criteria

- AC1 `npm run typecheck`, `npm run check`, `npm test`, and `npm run test:e2e` pass.
- AC2 No route, component, hook, schema, mock handler, or CSS rule remains for login
  or findings. A repository search for `signIn`, `SessionUser`, `findings`,
  `flagged`, `/login`, and `/security` in `fe/src` and `fe/e2e` returns nothing.
- AC3 Every class defined in `styles.css` is referenced by at least one file, and every
  file under `src/components/ui` is imported by at least one other file.
- AC4 Opening the app lands on the agents list for the configured developer identity
  without any sign-in step; the demo data for `admin` is visible in mock mode.

## Out of scope

Removing the `killed` and `cancelled` run statuses, deleting the agent edit page,
changing the backend owner's table redesign beyond the `flagged` marker, and any
change to the palette.
