# Plan: Page transitions and loading skeletons

Feature: `spec/2026-10-10-ui-polish/task.md`

## Design

- Transitions: `createRouter({ defaultViewTransition: true })` wraps every navigation's
  DOM commit in `document.startViewTransition` (TanStack Router skips it where the API
  is missing). `app-shell.tsx` gives the `<main>` area the `page-view` class, and
  `styles.css` names it `view-transition-name: page` with keyframes: old fades out and
  drifts up 120 ms, new fades in and rises 220 ms. The root group keeps `animation:
  none` (set for the theme reveal), so the sidebar does not move. During the theme
  switch `lib/theme.ts` puts `theme-switching` on `<html>` until the transition
  finishes; `html.theme-switching .page-view { view-transition-name: none }` keeps the
  page area inside the root circle. `prefers-reduced-motion: reduce` turns the
  keyframes off.
- Skeletons: `LoadingState({ label, layout = "panel" })` renders `<output
  aria-live="polite">` with a visually hidden label and `data-layout` (no `aria-busy`:
  it would hold back the announcement until the region is gone); bars are plain `div`s with
  `data-slot="skeleton"` and the `skeleton-bar` class (palette `--accent` fill, a
  highlight sweep from `--inset-glint` via `::after`, off under reduced motion).
  Layouts mirror the real screens: `table` (header + 4 rows with name, chip, status,
  date, actions), `detail` (header, tabs, three cards), `run` (header, timeline, two
  cards), `form` (fields and a text area), `panel` (three bars).

## Steps (test-first)

1. `states.test.tsx`, loading assertions in the list/detail/run tests, the
   `theme-switching` assertions in `theme.test.ts`, `e2e/ui-polish.spec.ts`; observe red.
2. Implement the router option, `page-view`, CSS, `LoadingState` layouts and call sites,
   and the theme class.
3. Biome, tsc, Vitest, then Playwright; screenshots; record results.

## Risks

- View transitions snapshot the page, so a very long page could feel heavier on weak
  machines; durations are kept short (≤ 220 ms).
- The `page` group also captures size changes between routes; the default group
  animation morphs them over 250 ms, which reads as intended.
