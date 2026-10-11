# Implementation record: Notify when a run finishes

Feature: `spec/2026-10-10-run-notifications/task.md`
Status: complete, awaiting commit (2026-10-10)

## Progress log

- 2026-10-10: task and plan written; tests first (`lib/toast.test.ts`,
  `lib/run-watch.test.ts`, `components/runs/run-notifications.test.tsx`, the
  `useStartRun` assertion in `queries.test.tsx`, the Playwright step in the demo flow);
  all four Vitest files failed on missing modules.
- 2026-10-10: implemented `lib/toast.ts`, `lib/run-watch.ts`, `components/ui/toast.tsx`
  (Radix Toast from the `radix-ui` package, shadcn style, palette tones),
  `components/toaster.tsx`, `components/runs/run-notifications.tsx`; `useStartRun`
  registers each run; `routes/_app.tsx` mounts the watcher and the toaster;
  `test/setup.ts` clears both stores and stubs pointer capture for jsdom.
- 2026-10-10: the component test first looked for `role="status"`; in Radix Toast 1.2
  only the hidden screen-reader announcement has that role (the visible toast has
  none), so the tests and the Playwright step find toasts by text inside the
  "Notifications" region (`[data-slot="toast"]`) instead.

- 2026-10-10: Playwright failed twice on every test's first page load even though the
  warm dev server showed no errors: four workers hit a cold Vite server at once and the
  extra toast modules pushed the first compile past the 15 s expect timeout. Added
  `e2e/global-setup.ts`, which loads the agents page once before the workers start
  (`globalSetup` in `playwright.config.ts`). A stale `vite` process from an earlier
  manual server was also holding port 3100 and had to be killed by PID.

## Decisions

- Notifications are a module store rendered by one `Toaster`, like the theme store:
  no context provider, any module can call `toast()`.
- The watcher reuses the run page's query (`runQueryOptions`), so an open run page and
  the watcher never poll the same run twice; polling stops when the run settles.
- The announcement is skipped on that run's own page, where the status updates live.
- When a watched run settles, the watcher also invalidates the agent, agents list,
  executions and agent-runs queries, so the list's "Last run" column flips with the
  toast instead of waiting for the next navigation (seen in the first screenshot:
  the row still said "Queued" while the toast said "Succeeded").
- A toast closes after 8 s (success) or 15 s (failure, timed out); Radix pauses the
  timer on hover and focus. Newest first, at most three.
- The action is a button that navigates (`router.navigate`) rather than a link, so the
  store stays free of router types.
- Radix's own live region announces the toast politely (`type="background"`); the
  visible element carries no extra role, avoiding double announcements.

## Test results (2026-10-10)

- `npm run check`: 97 files, no errors (1 pre-existing info about the Biome schema
  version).
- `npm run typecheck`: pass.
- `npm test`: 22 files, 107 tests pass (11 new).
- Visual check on the warm dev server (Playwright Chromium, light and dark): the toast
  shows the status dot, "<agent> — Succeeded", the output excerpt, "View run" and the
  dismiss control; two toasts stack newest first; 0 console or page errors.
- `npm run test:e2e`: 4 passed in 25 s with the warm-up (demo flow now starts a run
  from the list, waits for the notification and opens the run from it; the light WCAG
  scan includes the list with a notification open).

## Deviations and limitations

- Operating-system notifications (when the tab is in the background) are out of scope;
  the store is ready for a second channel if wanted.
