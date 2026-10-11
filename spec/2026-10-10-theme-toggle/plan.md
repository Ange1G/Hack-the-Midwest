# Plan: Light and dark theme toggle

Feature: `spec/2026-10-10-theme-toggle/task.md`

## Design

- State: the `dark` class on `<html>` is the single source of truth (the Tailwind dark
  variant is `&:is(.dark *)`). `lib/theme.ts` exposes `getTheme()` (reads the class),
  `setTheme()` (class + `localStorage["agent-platform.theme"]` + notify),
  `initTheme()` (apply what is stored), `toggleTheme(origin?)`, `useTheme()` via
  `useSyncExternalStore`, and `THEME_BOOT_SCRIPT`, the inline script the root route
  places in `<head>` so the stored theme applies before hydration. `<html>` gets
  `suppressHydrationWarning` because the script changes its class before React runs.
- Animation: `toggleTheme` wraps the switch in `document.startViewTransition` and
  animates `clip-path: circle()` on `::view-transition-new(root)` from the toggle's
  centre to the farthest viewport corner (~600 ms, ease-out). `styles.css` turns off
  the default cross-fade for `root` and lets pointer events through during the
  transition. No view transitions or `prefers-reduced-motion: reduce`: plain switch.
- Menu item: `DropdownMenuItem` in `sidebar/nav-user.tsx` after a separator; visible
  text "Theme", `aria-label="Theme: <current>"`, `title="Switch to <next> theme"`,
  sun and moon icons cross-rotating with the `dark:` variant. `onSelect` prevents the
  default close so the result is visible.
- `color-scheme: dark` on `.dark` in `styles.css` so scrollbars and native controls
  follow.

## Steps (test-first)

1. `lib/theme.test.ts`, the app-shell menu test, the dark Playwright test; observe red.
2. Implement `lib/theme.ts`, the menu item, the root boot script, the CSS.
3. Biome, tsc, Vitest, then Playwright; screenshots of both themes; record results.

## Risks

- Dark palette contrast is the backend owner's; the dark axe scan reports any pair
  below AA so it can be adjusted rather than hidden.
- View Transitions are not in every browser (Firefox gained same-document transitions
  recently); the fallback is the instant switch, so the feature never depends on it.
