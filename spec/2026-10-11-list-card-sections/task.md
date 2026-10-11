# Task: Card discovery sections on list pages

## Problem

Every index page (agents, chains, connectors, webhooks) is a single table. The things a user usually wants first (what ran recently, what needs attention, which kind of connector) need scanning or sorting, and the latest result of an agent is two clicks away.

## Outcome

Each list page opens with card sections for discovery, followed by a compact table that lists everything for scanning. Cards follow the redesign's typography, spacing, and semantic colour tokens.

## Acceptance criteria

1. **Agents.**
   - A "Needs attention" section shows flagged agents. It is hidden when none are flagged.
   - A "Recently ran" section shows up to 3 other agents, newest run first. Each card shows the last run's status and time, its connectors, and a Run button (Stop while active). Opening a card goes to the agent with its last run selected (`?run=`).
   - A "My agents" section holds the compact table, with the existing row actions and toasts.
2. **Chains.** A "Recently updated" section shows up to 3 chains, each with its step pipeline, a schedule summary, and a Run button that toasts with a link to the chain run. An "All chains" section holds the table.
3. **Connectors.** Type cards (HTTP, MCP, Database) show counts and act as toggle filters for the "All connectors" table below (`aria-pressed`).
4. **Webhooks.** A "Recently created" section shows up to 3 webhooks with their target and a "Copy fire URL" action. The secret is never shown on a card. An "All webhooks" section holds the table.
5. **Interaction.**
   - The whole card is clickable through one stretched link.
   - Secondary actions (edit, delete, copy) appear on hover or focus on devices that can hover, and are always visible on touch devices. The primary action is always visible.
   - Cards stagger in; motion is off under `prefers-reduced-motion`.
6. **No fake behaviour.** Agent Stop and Delete keep announcing "not available yet".

## Non-goals

- A cross-chain "recent runs" API. Chains use `updated_at`, and the section is labelled "Recently updated" rather than "Recently ran".
- A card/table view toggle.

## Tests

- Pure section helpers: ordering, limits, exclusion, schedule detection.
- Each list renders its sections and table; card actions work (run, copy, filter).
- The existing table tests are scoped to the table, because names now appear in cards too.
- The e2e specs are updated for duplicated names.
