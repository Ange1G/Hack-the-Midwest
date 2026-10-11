# Task: Connector library, agent PATCH, chain triggers

## Problem

MCP and database connectors execute in the worker but cannot be created or attached from the dashboard. Agents cannot be updated after create. Webhooks and the scheduler only start single agents, even though chains store a schedule.

**Depends on:** [2026-10-21-agent-chaining](../2026-10-21-agent-chaining/), [2026-10-21-webhook-triggers](../2026-10-21-webhook-triggers/), [2026-10-21-execution-scheduler](../2026-10-21-execution-scheduler/), [2026-10-10-connectors](../2026-10-10-connectors/), [2026-10-10-database-connectors](../2026-10-10-database-connectors/).

## Goals

1. Library-first connectors: users create HTTP, MCP, and database connectors, then attach them to agents by UUID.
2. `PATCH /agents/{user_sso}/{agent_id}` persists title, prompt, and connector references (full `configurations` replace).
3. Webhooks accept `target_type: agent | chain` and enqueue the matching resource on fire.
4. Scheduler enqueues chain runs when `agent_chains.schedule` matches, with per-slot dedupe.

## Constraints

- Authentication and ownership stay on the backend.
- Agent create/update never accept inline connector contracts.
- MCP references require `allowedTools`; HTTP/database references must not set it.
- Webhook fire remains HMAC-only (no SSO header).
- Secrets stay masked on read and never appear in logs.

## Acceptance criteria

1. User can create HTTP, MCP, and database connectors under `/connectors` and list them.
2. User can create and edit an agent that references only connector UUIDs (MCP includes `allowedTools`).
3. `PATCH` agent persists and enforces the same validation as create (owner-only, 422 on bad references).
4. Webhook targeting a chain: signed fire enqueues a chain run with the body as input.
5. Scheduler enqueues at most one chain run per chain per matching slot.
6. Existing HTTP-only agent runs, agent webhooks, and agent schedules remain green.

## Out of scope

- Connector UPDATE/DELETE API
- `GET /connectors/{id}/tools` MCP preview
- Chain PATCH
- Security findings UI
- Production Akamai database networking
