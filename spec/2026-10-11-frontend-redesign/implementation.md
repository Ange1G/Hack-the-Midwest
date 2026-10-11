# Implementation record: Frontend redesign

Status: complete (frontend only, no API contract changes).

## What shipped

- **Foundations.** `sonner` is the only new dependency. `src/lib/feedback.ts` wraps toasts; `src/lib/motion.ts` holds shared easing and variants. `styles.css` drops the island/serif theme and adds `--success`, `--warning`, `--info` semantic tokens registered in `@theme`.
- **Shell.** Inset sidebar, `PageHeader` (eyebrow back link, meta, action) and `Section` (titled bordered panel) primitives, page fade keyed by pathname.
- **Run panel.** `RunDetails` is shared by the agent page panel and `/runs/$runId`. The agent page keeps the selected run in `?run=`; without it the latest run is shown, so the last result is visible with zero clicks.
- **Run watcher.** `src/lib/run-watch.ts` is a small external store of watched run ids; `RunWatcher` (mounted in the app shell) polls each one and toasts exactly once on the terminal transition (toast id `run-finished-<id>`), then refreshes agent and execution caches. Sign-out clears the watch list.
- **Tables.** `DataTable` gains `density`, `onRowClick` (ignores clicks on interactive descendants), `isRowSelected`, and a capped staggered entrance.
- **Honest stubs.** Agent Stop and Delete have no backend yet; they announce "not available yet" with an info toast instead of faking success.

## Decisions

- **`renderSlot` instead of `flexRender`.** `flexRender` mounts an inline cell function as a component, so every parent re-render (for example a query's `isFetching` flip) remounted all cells. A click on a cell button could then land on a detached node. Calling cell and header functions directly keeps cell identity stable.
- **Palette independence.** Components use semantic tokens only; the `--lagoon`, `--sea-ink`, `--palm`, `--sand`, `--line`, `--foam` variables are gone.
- **Back links** use `backLinkClass` from `src/lib/styles.ts` in the page header eyebrow.

## Validation

- `npx vitest run`: 27 files, 135 tests passing.
- `npm run typecheck` and `npx biome check src`: clean.
- Playwright specs updated for the run panel (scoped to the "Run panel" region). They were not run in the agent sandbox because the installed Chromium build (1234) does not match the Playwright version (1248); run `npx playwright install chromium && npm run test:e2e` locally.
