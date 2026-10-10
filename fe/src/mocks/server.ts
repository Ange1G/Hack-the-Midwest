import { setupServer } from "msw/node";
import { handlers } from "./handlers";

// Node-side mock server for Vitest. Lifecycle is managed in src/test/setup.ts.
export const server = setupServer(...handlers);
