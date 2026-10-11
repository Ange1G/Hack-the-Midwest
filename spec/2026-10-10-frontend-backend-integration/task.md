# Frontend ↔ backend integration (create → run → results)

## Problem

The dashboard on `main` was built against a proposed `/runs` API and inline HTTP contracts on agents. The live API uses connector UUID references, `/executions`, and nested `result.output`.

## Outcome

A signed-in user can create an agent (with HTTP primitives), run it, and view status, output, errors, and tool calls against the real backend.

## Acceptance criteria

1. Creating an agent from the form creates HTTP connectors, then an agent whose `configurations.primitives` keys are those connector UUIDs.
2. Starting a run calls `POST /agents/{sso}/{agentId}/executions` and polls `GET /agents/{sso}/executions/{id}`.
3. The run view shows `result.output`, `error_message` / `error_code`, and `result.tool_calls`. `timed_out` is a first-class status.
4. Agent list and detail resolve connector UUIDs to HTTP method and name.
5. The security page explains that findings are not available yet and does not call a missing endpoint.
6. GET ` /agents/{sso}/{agent_id}` is implemented on the backend so agent detail works against the live API.

## Out of scope

- Saving agent edits
- Security findings / monitor UI
- MCP connector builder
- Event log streaming
