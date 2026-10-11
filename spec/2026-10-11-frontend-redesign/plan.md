# Plan: Frontend redesign

## Phase A - Foundations

- Add `sonner` (only new dependency) and `components/ui/sonner.tsx`; mount `<Toaster />` in the root document.
- `lib/feedback.ts`: `notify.success / notify.error / notify.info` wrappers so copy and error mapping live in one place. Components call these from mutation callbacks (one pattern; hooks in `queries.ts` stay transport-only).
- `lib/motion.ts`: shared durations/easings and variants for framer-motion; components call `useReducedMotion()` and fall back to no-op variants.
- `styles.css`: remove decorative body gradients/grid, the Fraunces import, `.island-shell`, `.display-title`, `.feature-card`, `.nav-link`, `.island-kicker`; neutral global link rule; Geist as `--font-sans`; add `--success`, `--warning`, `--info` tokens (values taken from the current palette) and register them in `@theme`.
- `Button`: press feedback (`active:scale`) disabled under reduced motion.

## Phase B - Shell

- `AppShell`: content max width, consistent padding, page fade-in keyed by pathname.
- `PageHeader`: tighter title scale, optional `eyebrow` back link, actions aligned right.
- Sidebar: drop the 0.8s header fade; quieter active state.
- `states.tsx`: card-like skeletons, dashed empty state with icon slot.
- New `Section` (titled panel) primitive replacing `Card className="island-shell"` usage.

## Phase C - Tables

- `DataTable`: `onRowClick`, `getRowId`, `selectedRowId`, `density`, animated row entrance; clicks on interactive descendants are ignored so links/buttons keep working.
- Apply to agents, connectors, chains, webhooks, findings, agent runs.

## Phase D - Run panel

- Extract `RunDetails` (status header, timeline, errors, input, output, tool calls) from `RunView`.
- `useRunLifecycle(runId)` hook: invalidates agent/executions caches and fires the terminal toast once per transition.
- `AgentDetail`: two-column layout (config + history | sticky run panel). Run composer lives in the panel; starting a run selects it. History rows select a run. Selected run id is kept in the URL search (`?run=`) so the agent list toast can deep link.
- Route `agents/$agentId`: validate `run` search param; no auto-navigation.

## Phase E - Surfaces

- Agent form: section headings, connector slots as bordered panels with segmented create/existing control, sticky submit bar.
- Connector form, chain form/detail/run, webhook list, findings, auth layout: shared `Section` and spacing.
- `StatusBadge`: pulsing dot for active statuses.

## Phase F - QA

- Update unit tests for changed copy/markup; add tests for the run panel, run lifecycle toast, agent list stub actions.
- Update e2e demo flow; run vitest, typecheck, biome, playwright.
- `fe/README.md`: toasts, motion, run panel notes.
