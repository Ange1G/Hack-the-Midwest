# Task: Webhook triggers for agent runs

## Problem

External systems cannot start an agent run without user SSO headers and manual API calls. Need signed inbound HTTP endpoints that enqueue executions with a payload as per-run input.

**Depends on:** [2026-10-21-execution-per-run-input](../2026-10-21-execution-per-run-input/task.md).

**Later extension:** Target type `chain` when [2026-10-21-agent-chaining](../2026-10-21-agent-chaining/task.md) ships.

## Goals

1. CRUD webhooks per owner: target (`agent` for MVP), `target_id`, HMAC secret (encrypted at rest).
2. Public `POST /api/v1/webhooks/{webhook_id}` (unguessable id) validates signature, maps body to `input`, enqueues execution **202**.
3. Rate limit and max body size per webhook.
4. Optional: include `execution_id` in response for integrator polling.

## Constraints

- Webhook route does **not** use `X-Dev-User-SSO`; auth is HMAC only (+ optional future IP allowlist).
- Never return secret or stack traces; reject invalid signature with 401.
- Enforce owner still owns target agent at fire time.

## Acceptance criteria

1. Create webhook → POST with valid signature enqueues execution with `input` derived from body (document mapping: raw JSON string or `$.message` field—pick one in plan implementation).
2. Invalid signature → 401, no execution row.
3. Deleted agent → 404 on fire.
4. Integration test covers full fire → worker not required (queued status enough).

## Out of scope

Chain webhooks (add field `target_type` in chaining slice), frontend webhook UI, OAuth.
