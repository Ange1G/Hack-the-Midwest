# Task: Tool-call run view (sources, counts, cost hint)

## Problem

The run view shows `result.tool_calls` as raw JSON. Users cannot quickly see what the agent did, which sources it read, how many paid external calls it made, or which call failed.

## Goals

1. Runner summaries carry `kind` (`http` | `mcp` | `database` | `knowledge` | `memory` | `delegate`), `ok` (boolean), `duration_ms`, and a bounded `arguments` preview where the model supplied arguments.
2. Failed tool calls are recorded (`ok: false`, `status: "error: …"`) before the error is returned to the model.
3. Frontend run view renders a structured list: kind badge, name, status, duration, arguments, expandable response body; summary counts per kind and an "external calls" line per connector (the cost hint).
4. Sources: http(s) URLs extracted from the output and tool response bodies, deduplicated, capped at 12, rendered as links with `rel="noopener noreferrer nofollow"` and `target="_blank"`.
5. Raw JSON stays available in a collapsible section.

## Acceptance criteria

1. Runner unit tests cover `kind`, `ok`, `duration_ms` and failure recording for HTTP, MCP, database, knowledge.
2. Frontend tests: counts per kind, a failed call shows as failed, sources are deduplicated and only http(s), old summaries without `kind` still render (kind inferred).
3. No secrets appear in summaries (credentials are never passed to summarizers).

## Out of scope

Token usage and dollar cost (the runner does not receive provider pricing), streaming progress.
