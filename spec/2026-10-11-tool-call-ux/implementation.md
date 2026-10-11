# Implementation: Tool-call run view

Status: implemented; awaiting human review.

## What shipped

### Runner

- `runner/tool_calls.py` provides `tracked_call`. It wraps every tool and records:
  - `kind` (`http`, `mcp`, `database`, `knowledge`, `memory`, `delegate`, `notification`);
  - `ok` and `duration_ms`;
  - `arguments`, capped at 1000 characters;
  - `delegate`, the delegate's title when a delegate agent made the call.
- Failed calls are recorded and the exception is re-raised, so Strands still reports the error to the model.

### Frontend

- `lib/tool-calls.ts` parses tool calls. Runs recorded before these fields existed get their `kind` and `ok` inferred from older fields (`mcp_tool`, `engine`, `method`, `HTTP nnn` status).
- It also computes:
  - counts per kind;
  - external calls per connector (`http`, `mcp`, `notification`), as a cost hint;
  - total time spent in tools;
  - sources: http(s) URLs from the final output first, then from tool responses. They are deduplicated, capped at 12, and exclude the origins of the tool endpoints themselves.
- `components/runs/tool-call-list.tsx` replaces the raw JSON dump in `RunDetails`. It shows:
  - kind badges with counts;
  - the external-calls line and the failure count;
  - a source list, opened with `target="_blank"` and `rel="noopener noreferrer nofollow"`;
  - one expandable row per call (arguments and response);
  - a "Memory updated" note built from `result.memory_writes`;
  - the raw JSON, still available in a collapsed section.

## Decisions

- **Call counts, not prices.** The cost hint is a count of external calls. Vendor pricing changes and is plan-specific, so no prices are shown.
- **Sources are extracted, not structured.** Sources are scraped from text rather than from a structured citation field. This works for every tool without changing tool contracts.

## Tests

- `lib/tool-calls.test.ts`: kind inference, counts, grouping, source ordering and deduplication, endpoint and `javascript:` filtering, the cap.
- `components/runs/tool-call-list.test.tsx`: badges, the external-calls line, link attributes, expanding a row, the memory note.
- API unit `test_runner_context_tools.py`: the runner side of `tracked_call`.
