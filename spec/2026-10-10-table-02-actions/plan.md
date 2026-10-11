# Plan: Table-02 actions pattern

Feature: `spec/2026-10-10-table-02-actions/task.md`

## Approach

1. Install `@blocks-so/table-02` as the visual reference, then extract tooltip
   icon actions into `data-table-action-button.tsx`.
2. Fold table-02 chrome (row height, padding, `TooltipProvider`) into
   `data-table.tsx`. Delete the demo `table-02.tsx` so there is one table.
3. Rebuild the agents list action bar: Start calls `useStartRun`; Stop and
   Delete are UI stubs; Edit and View are links.
4. Add `/agents/$agentId/edit` as a read-only `AgentForm` shell.
5. Apply the same action buttons to agent run history and security findings.
