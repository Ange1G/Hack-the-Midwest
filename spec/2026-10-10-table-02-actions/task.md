# Task: Table-02 actions pattern

Branch: current frontend work
Date: 2026-10-10

See `AGENTS.md` for the project constitution. This document does not repeat it.

## Problem

App tables (agents, runs, findings) used a plain sortable `DataTable` with
inconsistent or missing row actions. The agents list had no start/stop, edit, or
delete controls. Users had to open detail to run an agent.

## Intended outcome

One table implementation, adapted from `npx shadcn@latest add @blocks-so/table-02`
(tooltip icon actions, row busy state), used by every data table. The agents list
is the flagship: start a run, stub stop/delete, edit configuration shell, view
details.

## Acceptance criteria

- AC1 All app tables render through the shared `DataTable` with table-02 density
  and a shared action-button primitive.
- AC2 Agents list rows expose Start (wired), Stop (stub while last run is
  active), Edit configuration, View details, and Delete (stub).
- AC3 `/agents/$agentId/edit` shows a prefilled read-only configuration form.
  Save is disabled with helper text.
- AC4 Runs and findings tables use the same icon-action pattern.
- AC5 `pnpm test`, `pnpm typecheck`, and `pnpm check` pass in `fe/`.

## Out of scope

`useCancelRun` / DELETE agent API wiring, PATCH agent save, table pagination
controls.
