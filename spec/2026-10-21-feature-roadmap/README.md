# Feature roadmap (execute one spec at a time)

Do **not** implement this folder as code—it indexes discrete specifications. Each feature has `task.md`, `plan.md`, and `implementation.md` per [AGENTS.md](../../AGENTS.md).

## Execution order

| # | Spec directory | Deliverable | Depends on |
|---|----------------|-------------|------------|
| 1 | [2026-10-21-agent-execution-database](../2026-10-21-agent-execution-database/) | Worker + runner database tools | [2026-10-10-database-connectors](../2026-10-10-database-connectors/) |
| 2 | [2026-10-21-agent-execution-mcp](../2026-10-21-agent-execution-mcp/) | Worker + runner MCP tools | HTTP execution slice |
| 3 | [2026-10-21-execution-per-run-input](../2026-10-21-execution-per-run-input/) | `input` on enqueue → runner | — |
| 4 | [2026-10-21-execution-scheduler](../2026-10-21-execution-scheduler/) | `agent-scheduler` process | Per-run input |
| 5 | [2026-10-21-webhook-triggers](../2026-10-21-webhook-triggers/) | Signed hook → enqueue | Per-run input |
| 6 | [2026-10-21-agent-chaining](../2026-10-21-agent-chaining/) | Chains + orchestrator + UI | Per-run input; scheduler/webhook extend after |

## How to work a feature

1. Read `task.md` acceptance criteria.
2. Follow `plan.md` (TDD where practical).
3. Implement in a focused branch/PR; update `implementation.md` with results and validation commands.
4. Merge before starting the next row unless the plan explicitly allows parallel work (e.g. MCP vs database).

## Already shipped (context)

- [2026-10-10-agent-execution-mvp](../2026-10-10-agent-execution-mvp/)
- [2026-10-10-agent-execution-http-tools](../2026-10-10-agent-execution-http-tools/)
- [2026-10-10-strands-openai-runner](../2026-10-10-strands-openai-runner/)
- [2026-10-10-database-connectors](../2026-10-10-database-connectors/) (API + runtime, not worker-wired)
