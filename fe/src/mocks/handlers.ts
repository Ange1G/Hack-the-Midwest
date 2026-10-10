import type { HttpHandler } from "msw";

// Handlers implementing API contract v0 for development and tests. Grows with the
// API layer; see spec/2026-10-10-frontend-dashboard/plan.md.
export const handlers: HttpHandler[] = [];
