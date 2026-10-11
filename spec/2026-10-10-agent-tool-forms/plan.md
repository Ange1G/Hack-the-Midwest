# Plan: Agent tool forms

Feature: `spec/2026-10-10-agent-tool-forms/task.md`

## Current state

- `fe/src/components/agents/agent-form.tsx` is one 665-line component. Name and
  instructions use TanStack Form; HTTP calls and schedule are `useState` with a
  hand-rolled error map keyed `calls.<i>.<field>`.
- The edit page renders the same form with `readOnly`, and `draftsFromAgent`
  copies stored (masked) credentials into the inputs.
- Live API (`api/src/app/domains/agents/router.py`): `GET` and `POST
  /agents/{user_sso}`; primitives are flat HTTP contracts with methods GET and
  POST only.
- shadcn/ui is in use; `ui/select.tsx` is installed but unused. The form used
  native `<select>` with a copied class string.

## Decisions

1. Keep sending the live flat HTTP contract (AC5). The teammate's task does not
   define the generic HTTP `config` / `credentials` shape, so it is not guessed.
2. MCP tools are modelled and validated in full against the agreed MCP
   contract (`mcpToolInputSchema`) but refused at submit with a visible error
   (AC6), rather than hidden or sent to an API that would reject them.
3. Only methods the API accepts are selectable; the others from the task are
   listed disabled so the builder shows where it is going without pretending.
4. Native selects become the shadcn `Select` (method, tool type, month). Tests
   change how they pick an option, not what they assert. jsdom gets the pointer
   capture and `scrollIntoView` stubs Radix Select needs.
5. "Add HTTP call" becomes "Add tool"; tool fieldsets are "Tool 1", "Tool 2".

## Structure

`fe/src/components/agents/`

- `agent-form-model.ts`: draft types, `emptyTool`, `draftsFromAgent`,
  `buildInput`, `errorsFromServer`. No React.
- `agent-form.tsx`: owns state, basics fields, submit; composes the sections.
- `schedule-section.tsx`: days, times, month.
- `tools/tools-section.tsx`: tool list, add and remove.
- `tools/tool-card.tsx`: one tool: type choice, name, type fields, credentials,
  options.
- `tools/tool-type-select.tsx`, `tools/http-tool-fields.tsx`,
  `tools/mcp-tool-fields.tsx`, `tools/credential-fields.tsx`,
  `tools/tool-options-fields.tsx`.
- `tools/tool-types.ts`: labels, descriptions and option helper text per type.

`fe/src/components/form-field.tsx` gains `FormField` (label, hint, error and
`aria-describedby` wiring through a render prop) and `FieldError`.

`fe/src/lib/api/schemas.ts` gains `toolTypeSchema` and `mcpToolInputSchema`.
`fe/src/lib/http-contract.ts` gains `MAX_DESCRIPTION_LENGTH` and the method
list.

## Tests

- `agent-form-model.test.ts`: HTTP body unchanged, MCP validation messages, MCP
  refused at submit, duplicate names across types, credentials never prefilled.
- `agent-form.test.tsx`: existing cases kept (option picking updated), plus
  type switching, MCP helper text, MCP refusal, stored-credential hint.
- `agent-edit.test.tsx`: unchanged assertions.
- e2e: `demo-flow` and `a11y` updated for "Add tool" and the Select.
