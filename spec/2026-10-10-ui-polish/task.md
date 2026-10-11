# Task: Page transitions and loading skeletons

Branch: `feat/frontend-dashboard`
Date: 2026-10-10
Requested by: Angel (frontend owner)

See `AGENTS.md` for the project constitution. This document does not repeat it.

## Problem

Navigating between screens cuts hard from one page to the next, and every screen
shows the same three grey bars while it loads, so the layout jumps when data arrives.
Both are visible in every demo path and neither touches the features the backend
owner is working on.

## Intended outcome

- Moving between routes fades and lifts the page content into place while the
  sidebar stays put. The theme switch keeps its full-screen circle reveal.
- Each screen loads behind a sketch of its own layout (table rows, detail cards, run
  panels, form fields) with a soft highlight sweeping across the placeholders, so the
  real content lands where the placeholders were.
- People who prefer reduced motion get neither animation; screen readers still hear
  what is loading.

## Scope

- Router `defaultViewTransition` and a `page` view-transition-name on the main
  content area; CSS keyframes for the page group; the theme switch opts the page
  area out so only the root animates during the reveal.
- `LoadingState` gains a `layout` prop (`panel`, `table`, `detail`, `run`, `form`) and
  a visually hidden label; the five screens pick the layout that matches them.
- Tests: `states.test.tsx` for the layouts, assertions on the loading states of the
  list, detail and run screens, the theme unit test for the opt-out class, and a
  Playwright test that route changes start a view transition scoped to the page area.

## Acceptance criteria

- AC1 A navigation inside the app calls `document.startViewTransition`; the `<main>`
  content area has `view-transition-name: page`; with the `theme-switching` class on
  `<html>` it has `none`.
- AC2 `LoadingState` renders `role="status"` with the label text (visually hidden) and
  the requested layout (`data-layout`); the agents list uses `table`, the detail and
  edit screens `detail`/`form`, the run page `run`.
- AC3 Under `prefers-reduced-motion: reduce` the page keyframes and the shimmer are off.
- AC4 `npm run check`, `npm run typecheck`, `npm test`, `npm run test:e2e` pass.

## Out of scope

Animating data arriving inside a page (list rows appearing one by one), shared-element
transitions between list and detail, and any change to the palette.
