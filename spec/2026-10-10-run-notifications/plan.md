# Plan: Notify when a run finishes

Feature: `spec/2026-10-10-run-notifications/task.md`

## Design

- Store (`lib/toast.ts`): module state + `useSyncExternalStore`, the same pattern as
  `lib/theme.ts`. `toast({ title, description?, tone?, durationMs?, action? })`
  returns an id; `dismissToast(id)` flips `open` to false (so Radix plays the exit
  animation) and removes the item 400 ms later; newest first, capped at three;
  `clearToasts()` for tests. An action is `{ label, onSelect }` so the caller decides
  what it does (here: navigate to the run).
- Watch list (`lib/run-watch.ts`): the ids of runs started in this session;
  `watchRun`, `unwatchRun`, `useWatchedRuns`, `getWatchedRuns`, `clearWatchedRuns`.
  `useStartRun` calls `watchRun(run.id)` in `onSuccess`.
- `components/runs/run-notifications.tsx`: renders one invisible `WatchedRun` per
  id. Each uses `useRun(id)` (polls while active through the shared query, so the run
  page and the watcher never poll twice) and the cached agent query for the title.
  When the run settles it unwatches itself and, unless the router is on
  `/runs/<id>`, pushes a toast: title `<agent> — <status label>`, description = output
  or error excerpt (≤ 140 chars), tone success/danger, duration 8 s / 15 s, action
  "View run" → `router.navigate`.
- UI (`components/ui/toast.tsx`, shadcn style over `radix-ui`'s Toast): Provider,
  Viewport (fixed bottom-right, 420 px max), Root with `type="background"` and tone
  border classes, Title (rendered with `ToneBadge` for the dot), Description, Action,
  Close (`aria-label="Dismiss"`). `components/toaster.tsx` maps the store to those.
  Mounted in `routes/_app.tsx` next to `RunNotifications`.
- Tests clear both stores in `test/setup.ts`.

## Steps (test-first)

1. Store tests, `run-notifications.test.tsx`, the `useStartRun` assertion, the
   Playwright step; observe red.
2. Implement store, watcher, UI, wiring.
3. Biome, tsc, Vitest, then Playwright; screenshot; record.

## Risks

- Polling a watched run uses the same query as the run page, so cost is one request
  per 1.5 s per active run; the list is bounded by the runs a person starts.
- Radix Toast pauses timers on hover/focus and announces through its own live region;
  the `status` role used in tests comes from `type="background"`.
