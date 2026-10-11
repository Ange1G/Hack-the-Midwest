# Task: Structured final output

## Problem

Agent output is free text. Chains and downstream automation have to re-parse prose, and a malformed reply is only noticed when a later step misbehaves.

## Goals

1. Optional `configurations.outputSchema` (JSON Schema) on an agent.
2. The runner tells the model to reply with matching JSON, then validates the final reply deterministically (not by asking the model).
3. A matching reply is stored as `result.parsed`; a non-matching one fails the run with a clear error code while keeping `result.output`.
4. Chains hand the next step compact JSON from `result.parsed`.
5. The run view shows the structured output, or why validation failed.

## Constraints

- Schema is untrusted user input: size cap (16,000 characters of JSON), must pass Draft 2020-12 meta-validation, and only local `$ref` values (`#...`) so validation never fetches a URL.
- Validation errors are bounded (first 5 paths, 300 characters each, message ≤ 2000).
- No change to the callback contract other than the optional `result.parsed` key.

## Acceptance criteria

1. Saving an agent with an invalid schema, a remote `$ref`, or an oversized schema returns 422 with a `configurations.outputSchema` field path.
2. A reply wrapped in a ```` ```json ```` fence that matches is accepted and stored in `result.parsed`.
3. Prose or mismatched JSON fails the run with `output_invalid_json` or `output_schema_mismatch`; the error names the failing JSON paths; `result.output` is kept.
4. Agents without a schema behave exactly as before.
5. Chain handoff uses `result.parsed` when present.

## Out of scope

Provider-native structured output modes, retries asking the model to fix its reply, schema editors.
