# Implementation record: Page transitions and loading skeletons

Feature: `spec/2026-10-10-ui-polish/task.md`
Status: complete, awaiting commit (2026-10-10)

## Progress log

- 2026-10-10: task and plan written; tests first (`states.test.tsx`, loading-layout
  assertions in the list, detail and run tests, `theme-switching` assertions in
  `theme.test.ts`, `e2e/ui-polish.spec.ts`); 7 unit tests failed before the change.
- 2026-10-10: implemented `defaultViewTransition: true` in `router.tsx`, the `page-view`
  class on the main content area, the page keyframes, the theme opt-out class in
  `lib/theme.ts` and `styles.css`, `LoadingState` layouts (`panel`, `table`, `detail`,
  `run`, `form`) with the `skeleton-bar` sweep, and the matching layout at each call
  site (list and runs tab: `table`; detail: `detail`; edit: `form`; run page: `run`).

## Decisions

- Only the `<main>` area carries a `view-transition-name`, so the sidebar never moves
  and the root group keeps the `animation: none` set for the theme reveal.
- During the theme switch the page area drops its `view-transition-name` (class
  `theme-switching` on `<html>` until the transition finishes); otherwise the page
  group would swap instantly beside the growing circle.
- `LoadingState` keeps `role="status"` with `aria-live="polite"` and a visually hidden
  label; `aria-busy` was considered and left out because it holds back the
  announcement until the region is gone.
- Placeholder bars are plain `div`s (`data-slot="skeleton"`, class `skeleton-bar`) so
  the sweep replaces shadcn's pulse instead of stacking on it; `ui/skeleton.tsx` stays
  for the sidebar.
- Both animations and the sweep are off under `prefers-reduced-motion: reduce`.

## Test results (2026-10-10)

- `npm run check`: 89 files, no errors (1 pre-existing info about the Biome schema
  version).
- `npm run typecheck`: pass.
- `npm test`: 19 files, 94 tests pass (3 new).
- `npm run test:e2e`: 4 passed (demo flow, light and dark WCAG scans, and the new
  page-transition test: a navigation starts a view transition, `<main>` carries
  `view-transition-name: page`, and `none` while `theme-switching` is set).

- Visual check against the running `dev:mock` server (Playwright Chromium, 1280×800):
  the four skeleton layouts mounted into the page area match the real screens, the
  sweep highlight renders on the palette `--accent` fill, and a frame captured as the
  router commits shows the page area mid-transition; 0 console or page errors.

## Deviations and limitations

- The skeletons are only visible for a few milliseconds in mock mode (responses are
  instant); they matter against the real API. The visual check mounts them directly.
- The mid-transition frame in the visual check is timing dependent; the Playwright test
  asserts the mechanism (a view transition starts, scoped to the page area) rather than
  a particular frame.
