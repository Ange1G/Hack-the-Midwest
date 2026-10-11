# Implementation record: Card discovery sections

Status: complete (frontend only, no API changes).

## What shipped

- **Shared pieces** (`fe/src/components/list/`):
  - `ListSection`: a heading, an optional count, a description, and an action.
  - `CardGrid` / `CardGridItem`: a staggered entrance, an exit animation, and layout animation (off under reduced motion), with its own `TooltipProvider`.
  - `ResourceCard*` compound parts. `cardLinkProps` turns the title link into a stretched link covering the card. Other links and buttons in the card are lifted above it, and the card shows a focus ring when its title link is keyboard-focused.
  - `ResourceCardActions` hides secondary actions until hover or focus only on devices that can hover.
- **Pure helpers** (`fe/src/lib/list-sections.ts`): `lastRunFor`, `recentlyRanAgents`, `flaggedAgents`, `newestFirst`, `isScheduled`. The chain detail schedule summary now uses `isScheduled` too.
- **`useCopy`** (`fe/src/lib/use-copy.ts`): extracted from `OutputBlock` and reused by the webhook cards. The `OutputBlock` copy button is now always visible on touch devices.
- **Agents.**
  - "Needs attention" lists flagged agents.
  - "Recently ran" holds up to 3 non-flagged agents; a card opens `/agents/<id>?run=<last-run>`.
  - "My agents" holds the compact table.
  - Cards and table share one start mutation (`useAgentRunAction`). Stop and Delete still announce "not available yet".
- **Chains.** "Recently updated" cards show:
  - the step pipeline
  - "Scheduled" or "On demand"
  - a Run button whose toast links to `/chain-runs/<id>`
  "All chains" holds the table.
- **Connectors.** "By type" cards (HTTP, MCP, Database) with counts toggle a filter on the table (`aria-pressed`, plus "Clear filter").
- **Webhooks.** "Recently created" cards show the target, Active/Disabled, and "Copy URL". The secret never appears on a card. "All webhooks" holds the table.

## Decisions

- **Connectors deviate from the plan.** They use type filter cards rather than "Recently added". There is no connector detail page, so recent-connector cards would only repeat the table's first rows.
- **Card button names** use `aria-label` (for example "Run Uptime checker") that starts with the visible text. A visually hidden span lost its leading space in the computed name.
- **Contrast fixes found by the axe scan**, measured with the current `:root` palette:
  - HTTP chip method segments, the avatar initials, and the agent form's create/existing toggle now use foreground text.
  - Table row hover and selection use `bg-muted/40`, and a selected row also gets an inset foreground bar. Muted text on full `--muted` measured 4.11:1.
- **The a11y e2e spec runs with `reducedMotion: "reduce"`.** Otherwise axe measured colours blended mid-way through the page fade-in.

## Validation

- `npx vitest run`: 28 files, 150 tests passing (15 new or updated for the sections).
- `npm run typecheck` and `npx biome check src e2e`: clean.
- `npx playwright test`: 5 of 5 passing, including the axe WCAG 2.1 AA scans. Locators were scoped to the table or used `exact: true` where names now also appear on cards.
- Requires Chromium build 1248 (`npx playwright install chromium`).
