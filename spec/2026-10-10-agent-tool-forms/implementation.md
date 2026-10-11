# Implementation record: Agent tool forms

Feature: `spec/2026-10-10-agent-tool-forms/task.md`
Status: implemented, **not yet validated** (see Validation)

## Progress log

- 2026-10-10: Split `agent-form.tsx` into `agent-form-model.ts` (drafts,
  body building, error mapping) and composed sections: `schedule-section.tsx`
  and `tools/` (`tools-section`, `tool-card`, `tool-type-select`,
  `http-tool-fields`, `mcp-tool-fields`, `credential-fields`,
  `tool-options-fields`, `tool-types`). Added `FormField` / `FieldError` to
  `components/form-field.tsx`.
- Added `toolTypeSchema` and `mcpToolInputSchema` to `lib/api/schemas.ts`;
  HTTP and MCP share one options schema and one public-URL schema.
- Added `MAX_DESCRIPTION_LENGTH` and `HTTP_METHOD_OPTIONS` to
  `lib/http-contract.ts`.
- Method, tool type and month now use the installed shadcn `Select`; the
  copied native-select class is gone. `test/setup.ts` stubs pointer capture and
  `scrollIntoView` for Radix Select in jsdom.
- Edit form: credential inputs start empty; `storedCredentials` drives a
  "stored and hidden" hint (AC7).
- Styling uses existing tokens and classes only: `island-shell` cards,
  `island-kicker` for the tool type label, `text-muted-foreground` hints,
  `text-destructive` errors (AC8).

## Decisions taken without explicit confirmation

These were proposed in the plan and not yet confirmed by the project owner:

1. The create body stays the live flat HTTP contract (AC5).
2. MCP tools are validated and then refused at submit with a visible message
   (AC6), not hidden.
3. PUT, PATCH and DELETE are listed but disabled (AC2).

## Test changes

- `agent-form.test.tsx`: same assertions; option picking goes through the
  Select, and labels changed ("Add tool", "Tool name", "Tool 1"). New cases:
  disabled methods, switching to MCP, MCP validation and refusal, stored
  credentials not prefilled.
- `agent-form-model.test.ts` (new): HTTP body, MCP refusal, MCP error mapping,
  unique names across types, server error placement, `buildMcpTool`,
  `draftsFromAgent` credentials.
- e2e `demo-flow` and `a11y`: "Add tool", "Tool name", Select interaction.

## Validation

Not run: Node.js is not installed on the machine this was written on, so
`vitest`, `tsc --noEmit`, `biome check` and Playwright have not been executed.
They must pass before this is shipped (AC9).

## Known limitations and follow-ups

- MCP tools cannot be saved until the connectors API is live
  (`spec/2026-10-10-connectors`); `allowedTools` per agent is not modelled.
- Once saving on edit exists, an empty credential input must mean "keep the
  stored value", not "clear it".
- `origin/feat/frontend-dashboard` (unmerged) also edits `http-contract.ts`,
  `agent-form.test.tsx`, the test session/fixtures and the e2e specs; expect
  merge conflicts with this branch.
