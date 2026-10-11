# Plan: Card discovery sections

1. `fe/src/lib/list-sections.ts`. These are pure helpers:
   - `lastRunFor` (moved from `agent-list.tsx`)
   - `recentlyRanAgents`
   - `flaggedAgents`
   - `newestFirst`
   - `isScheduled`
   Each has unit tests.
2. `fe/src/components/list/`. The pieces are:
   - `ListSection`: a light heading, optional count, and actions.
   - `CardGrid` / `CardGridItem`: a responsive grid with a staggered entrance and a `TooltipProvider`.
   - `ResourceCard` compound parts: `ResourceCard`, `ResourceCardHeader`, `ResourceCardTitle` (stretched link), `ResourceCardActions` (hover-reveal), `ResourceCardBody`, `ResourceCardFooter`.
3. Agents: extract `useAgentRunAction` so the table and cards share start/stop/toast logic. Add `AgentCard` and the sections.
4. Chains: `ChainCard` with the step pipeline, a "Scheduled" / "On demand" marker (`isScheduled`), and a run toast linking to the chain run.
5. Connectors: type filter cards plus the filtered table.
6. Webhooks: `WebhookCard` with copy fire URL and delete.
7. `OutputBlock` copy button: always visible on touch devices (it was hover-only).
8. Tests and e2e updates; record the results in `implementation.md`.
