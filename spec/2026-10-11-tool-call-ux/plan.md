# Plan: Tool-call run view

## Runner

- `tool_calls.py`: `record_call(calls, summary, *, kind, started, ok=True, arguments=None)` adds `kind`, `ok`, `duration_ms`, `arguments` (JSON, truncated to 1000 characters) and appends. `error_summary(...)` builds the failure shape.
- Entry point wrappers time each call, catch exceptions, record failure, and re-raise so Strands reports the error to the model.

## Frontend

- `lib/tool-calls.ts`: `parseToolCalls(result)` (tolerant of legacy summaries), `inferKind`, `toolCallCounts`, `externalCallCounts`, `extractSources(output, calls)`.
- `components/runs/tool-call-list.tsx`: summary header, sources list, per-call rows using native `<details>` for bodies (keyboard accessible, no extra dependency).
- `run-details.tsx` replaces the JSON dump with the list; raw JSON behind a `<details>`.
- Mock runs emit realistic summaries with `kind`.
