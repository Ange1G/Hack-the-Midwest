# Frontend agent notes

Platform constitution, architecture, and SDLC live at the **repository root**:

- [../AGENTS.md](../AGENTS.md) — requirements, security, testing, spec-driven workflow
- [../README.md](../README.md) — system overview and tech stack

If anything here conflicts with root docs, follow the root.

## Frontend scope

- React, TypeScript, TanStack Router, shadcn/ui (see [README.md](../README.md)).
- Use shadcn CLI to add components (see [.cursorrules](.cursorrules)).
- Tests: Vitest (unit/integration), Playwright (e2e), per root AGENTS.md quality control.

## Local conventions

- Keep server state, client state, and form state distinct.
- Treat API contracts as defined by the backend; verify routes in `api/` before wiring UI.
