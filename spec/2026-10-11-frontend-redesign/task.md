# Task: Frontend redesign (Vercel-like, minimal, interactive)

## Problem

The dashboard works end to end but reads as a themed demo: gradient "island" cards, a serif display face, a decorative body background, and palette-specific link colours scattered through components. Feedback after actions is inline only, and seeing the result of a run takes extra navigation (agent detail -> run page).

## Outcome

A minimal, Vercel-like dashboard where structure (typography, spacing, borders, motion) is owned by components and colour is owned entirely by `:root` CSS variables, so the palette can be swapped without touching component code.

## Acceptance criteria

1. **Toasts (Sonner)** confirm or report: agent create, agent update, connector create, run start, run finish (succeeded / failed / timed out), chain create/delete, chain run start, webhook create/delete, sign-out.
2. **Run results without navigation.** Starting a run on an agent page keeps the user on that page and shows a live run panel (status, timeline, output, tool calls, errors). Selecting a past run in the agent's history loads it into the same panel. `/runs/$runId` remains a shareable deep link that renders the same run content.
3. **Agent list** starts runs from a row and toasts with an action that opens the agent page with that run selected.
4. **Tables** have row hover, a compact density, and click-to-open rows where a primary destination exists; keyboard users keep explicit links/buttons.
5. **Motion**: buttons give press feedback; page content and table rows fade/slide in; status changes animate. All non-essential motion is disabled under `prefers-reduced-motion`.
6. **Typography & spacing**: one sans family (Geist) and mono (Geist Mono); no serif display face; consistent page header, section and card rhythm.
7. **Palette independence**: components use semantic tokens only (`background`, `foreground`, `muted`, `border`, `primary`, `destructive`, plus new `success`, `warning`, `info`). No `--lagoon`/`--sea-ink`/`--palm`/`--sand` references remain in components.
8. Vitest suite, typecheck, and Playwright e2e/a11y specs pass.

## Non-goals

- Choosing a palette. Existing `:root` colour values are kept; only semantic aliases are added.
- Backend cancel/delete for runs and agents. The agent list's Stop/Delete stay visually present but announce "not available yet" instead of pretending to succeed.
- Dark-mode toggle UI.

## Affected components

`fe/src/styles.css`, `fe/src/components/**` (layout, sidebar, states, data-table, badges, notices, agents, runs, connectors, chains, webhooks, security, auth), `fe/src/routes/_app/agents/$agentId.tsx`, `fe/src/routes/__root.tsx`, `fe/src/lib/api/queries.ts` (no contract changes).

## Security / failure considerations

- Toasts render API error messages already shown inline today; no secrets or tokens are put in toasts.
- Run-finish toasts fire once per observed transition from an active to a terminal status, so polling or remounts do not duplicate them.

## Tests

- Run panel: start run on agent detail shows output without navigation; selecting history row loads it.
- Run toasts: terminal transition fires exactly once.
- Agent list: Stop/Delete report unavailability (no fake success).
- Existing suites updated for markup changes; e2e demo flow asserts output on the agent page.
