# Task: Database connectors at execution time

## Problem

Database connectors can be created via the API and referenced on agents, and [`agent_databases()`](../../api/src/app/runtime/agent_databases.py) can provision external/provisioned databases—but only [`databases_cli`](../../api/src/app/runtime/databases_cli.py) calls it. The execution worker does not prepare databases or expose DB tools in the runner, so agents cannot use BYO or provisioned databases during runs.

Builds on [2026-10-10-database-connectors](../2026-10-10-database-connectors/task.md) and [2026-10-10-agent-execution-http-tools](../2026-10-10-agent-execution-http-tools/task.md).

## Goals

1. When the worker claims an execution, wrap the run in `agent_databases()` so provisioned DBs start (or reuse) and `run`-lifecycle DBs are released on completion or failure.
2. Pass safe connection parameters to the runner container (env JSON, not manifest/callback).
3. Register Strands tools per referenced database connector (engine-aware, read-only enforcement when configured).
4. Fail the execution with clear `error_code` on provisioning/SSRF errors (no credentials in messages).

## Constraints

See [AGENTS.md](../../AGENTS.md).

- Provisioned DBs: Docker on worker host; network reachability from runner container (`host.docker.internal` or shared network per database spec).
- External DBs: re-check resolved addresses at run start; TLS required; default `readOnly`.
- Cross-tenant: only owner's connectors; same `connector_missing` semantics as HTTP bundle.
- Secrets never in logs, `AGENT_MANIFEST`, or callback `result`.

## Acceptance criteria

1. Agent with external postgres connector (test double or integration DB) completes a run that performs a read via the DB tool.
2. Agent with provisioned `lifecycle: run` DB: container can connect; DB removed after run ends (success or fail).
3. `readOnly` external config rejects write SQL deterministically (test proves, not LLM-only).
4. Worker claim fails fast with `AgentDatabaseError` mapped to failed execution when provisioning fails.
5. HTTP and existing execution tests remain green.

## Out of scope

MCP execution, per-run input, scheduler, webhooks, chains, frontend polish, Akamai production networking doc (follow-up note in implementation.md only).
