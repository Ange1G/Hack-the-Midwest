# Implementation record: Table-02 actions pattern

Feature: `spec/2026-10-10-table-02-actions/task.md`
Status: implemented (UI pass; Start wired, Stop/Delete stubs, edit save disabled)

## Progress log

- 2026-10-10: Installed `@blocks-so/table-02`, extracted
  `DataTableActionButton` / `DataTableActionsCell`, updated `DataTable` chrome,
  rebuilt agents / runs / findings row actions, added read-only edit shell at
  `/agents/$agentId/edit`. Start is wired; Stop and Delete are UI stubs until
  the cancel/delete APIs exist.
- 2026-10-10 (color pass): tables use `.table-panel` (`--card`, `--line`,
  `--shadow-sm`) instead of `.island-shell`. HTTP chips use `--chip-bg` /
  `--chip-line`. In-table links use `tableLinkClass` (body text, no underline).
  Destructive row actions use `--destructive-foreground` instead of `text-white`.
- 2026-10-10: Run/severity labels (`StatusBadge`, `ToneBadge`) use a palette dot
  plus foreground text instead of shadcn outline pills (Killed, Succeeded,
  Flagged, findings severity/action).
