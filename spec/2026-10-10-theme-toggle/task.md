# Task: Light and dark theme toggle

Branch: `feat/frontend-dashboard`
Date: 2026-10-10
Requested by: Angel (frontend owner)

See `AGENTS.md` for the project constitution. This document does not repeat it.

## Problem

The palette already defines a dark variant (`.dark` in `styles.css`) but nothing lets a
person switch to it. Judges and teammates demo on different screens and in different
rooms; a dark mode that is one click away helps there.

## Intended outcome

A "Theme" entry with a sun/moon symbol in the account menu (the pop-out under the
SSO id in the sidebar) switches the whole app between light and dark. Light stays the
default and looks exactly as today. The choice is remembered per browser and applied
before the first paint, so a reload never flashes the other theme. The switch is
animated: the new theme is revealed by a circle growing out of the toggle.

## Scope

- `lib/theme.ts`: read, apply, remember and toggle the theme; the circular reveal via
  the View Transitions API with a plain switch as the fallback and for people who
  prefer reduced motion.
- Account menu item "Theme" with an animated sun/moon icon; the menu stays open so
  the change is visible where it was made.
- Root document: inline boot script that applies the remembered theme before
  hydration; `color-scheme` follows the theme so native controls match.
- Tests: unit tests for the theme module, an app-shell test for the menu item, and a
  Playwright test that toggles, reloads, and runs the WCAG 2.1 AA scan on the dark
  list, detail and builder screens.

## Acceptance criteria

- AC1 Light is the default; with nothing stored the app renders as before.
- AC2 Activating "Theme" in the account menu adds or removes the `dark` class on
  `<html>`, stores the choice, and updates the item's accessible name
  (`Theme: light` / `Theme: dark`).
- AC3 After a reload the stored theme is applied before React hydrates.
- AC4 In browsers with `document.startViewTransition` and no reduced-motion
  preference, the switch animates a circle from the toggle; otherwise it switches
  instantly.
- AC5 The dark list, detail and builder screens pass the axe WCAG 2.1 AA scan
  (serious/critical) outside the sidebar, like the light ones.
- AC6 `npm run check`, `npm run typecheck`, `npm test`, `npm run test:e2e` pass.

## Out of scope

Following the operating system preference automatically (light is the product
default), per-user server-side storage of the preference, and changes to the palette
values themselves.
