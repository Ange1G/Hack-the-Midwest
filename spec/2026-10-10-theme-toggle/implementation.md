# Implementation record: Light and dark theme toggle

Feature: `spec/2026-10-10-theme-toggle/task.md`
Status: complete, awaiting commit (2026-10-10)

## Progress log

- 2026-10-10: task and plan written; tests first (`lib/theme.test.ts`, the account-menu
  test in `layout/app-shell.test.tsx`, the dark-mode Playwright test in
  `e2e/a11y.spec.ts`); both Vitest files failed on the missing module.
- 2026-10-10: implemented `lib/theme.ts` (state on `<html>`, localStorage memory,
  `useTheme`, `toggleTheme` with the circular View Transition reveal and the
  reduced-motion/unsupported fallback, `THEME_BOOT_SCRIPT`), the "Theme" menu item
  with cross-rotating sun/moon icons in `sidebar/nav-user.tsx`, the inline boot script
  and `suppressHydrationWarning` in `routes/__root.tsx`, and the CSS (`color-scheme:
  dark` on `.dark`, no default cross-fade for `root`, pointer events allowed during the
  transition). `test/setup.ts` clears the class and storage after each test.

- 2026-10-10: teammates found the light theme's glow and grid overlays (`body::before`,
  `body::after`) distracting in dark mode, where their white-based gradients read as
  grey circles. Dark mode now hides both (`.dark body::before, .dark body::after`);
  light mode is unchanged. The dark Playwright test asserts the computed `display` of
  both overlays in each theme (red before the CSS change, green after).
- 2026-10-10: one Playwright run failed on the very first assertion of all three tests
  (the "Agents" heading within 5 s) and passed on rerun: the fresh test server compiles
  the app on demand and three workers start at once. `playwright.config.ts` now sets
  `expect.timeout` to 15 s.

## Decisions

- The `dark` class on `<html>` is the single source of truth; `getTheme()` reads it so
  React agrees with whatever the boot script applied before hydration.
- Light is the default regardless of the operating system preference, as requested;
  following `prefers-color-scheme` is a one-line change in `storedTheme()` if wanted.
- The menu item is a plain `menuitem` with the visible text "Theme", accessible name
  `Theme: <current>` and a `title` describing the switch, so the label stays as short as
  asked while screen readers hear the state. The menu stays open after the switch.
- The reveal is skipped under `prefers-reduced-motion: reduce` and in browsers without
  `document.startViewTransition`; the theme change itself never depends on it.
- The dark axe scan covers the list, detail and builder (sidebar excluded, as in the
  light scans). It passed without palette changes.

## Test results (2026-10-10)

- `npm run check`: 88 files, no errors (1 pre-existing info about the Biome schema
  version).
- `npm run typecheck`: pass.
- `npm test`: 18 files, 91 tests pass (8 new).
- `npm run test:e2e`: 3 passed (demo flow; light WCAG scans; dark mode remembered
  across a reload with WCAG scans of the dark list, detail and builder). Re-run after
  the overlay change: 3 passed (one cold-start flake before, see the progress log).
- Visual check against the running `dev:mock` server (Playwright Chromium, 1280×800):
  screenshots of the light menu, a frame mid-reveal (the dark circle growing out of the
  toggle), the dark menu with the moon icon, and the dark detail page; 0 console or
  page errors.

## Deviations and limitations

- The sidebar is excluded from the axe scans in both themes, as before; its dark
  palette is the sidebar owner's.
- No automated test proves the absence of a flash on reload; it follows from the inline
  head script, which has its own unit test.
