# Task: Notify when a run finishes

Branch: `feat/run-notifications`
Date: 2026-10-10
Requested by: Angel (frontend owner)

See `AGENTS.md` for the project constitution. This document does not repeat it.

## Problem

Starting a run from the agents list gives no feedback beyond the row's status badge,
and the run page has to stay open to learn how a run ended. People keep working
elsewhere while an agent runs (seconds today, minutes with real tools) and miss the
outcome.

## Intended outcome

Every run started in the app is watched until it settles. When it does, a
notification slides in at the bottom-right of any screen: agent name, outcome
(succeeded, failed, timed out), a short excerpt of the output or error, and a
"View run" action that opens the run page. It can be dismissed, swiped away, or left
to disappear on its own. If the run page for that run is already open, nothing pops
up: the status there updates live.

## Scope

- `lib/toast.ts`: a small notification store (`toast`, `dismissToast`, `useToasts`),
  newest first, at most three on screen, exit animation before removal.
- `components/ui/toast.tsx` + `components/toaster.tsx`: Radix Toast (already in the
  `radix-ui` package) styled with the palette tokens, tone carried by the border and a
  status dot, text in `--foreground`; mounted in the app layout.
- `lib/run-watch.ts` + `components/runs/run-notifications.tsx`: runs started through
  `useStartRun` are watched; each watched run is polled through the existing
  `runQueryOptions` (shared with the run page) and announced once when it settles.
- Tests: store tests, a component test for the announcement, the quiet case and
  dismissal, a hook test that starting a run registers it, and a Playwright step in
  the demo flow (start from the list, see the notification, open the run).

## Acceptance criteria

- AC1 Starting a run from the list or the detail page registers it; when the run
  settles anywhere else in the app, a notification in the "Notifications" region shows
  the agent title, the status label, and an excerpt, with "View run" and "Dismiss"
  controls; Radix announces it to screen readers politely.
- AC2 No notification when the current page is that run's page.
- AC3 A run is announced once; the store holds at most three notifications.
- AC4 The notification region is accessible (Radix region "Notifications", polite
  live announcements) and the colours come from `:root` tokens; the axe scan of a
  screen with a notification open reports no serious issues outside the sidebar.
- AC5 `npm run check`, `npm run typecheck`, `npm test`, `npm run test:e2e` pass.

## Out of scope

Operating-system notifications (Notification API) when the tab is hidden, sounds,
persisting notifications across reloads, and notifying about runs started elsewhere
(other tabs, schedules).
