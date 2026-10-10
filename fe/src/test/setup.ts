import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "#/mocks/server";
import { resetMockState } from "#/mocks/state";

// jsdom has no ResizeObserver; Radix primitives (Checkbox) expect one to exist.
class ResizeObserverStub {
	observe(): void {
		// No layout in jsdom, nothing to observe.
	}
	unobserve(): void {
		// No layout in jsdom, nothing to observe.
	}
	disconnect(): void {
		// No layout in jsdom, nothing to observe.
	}
}
globalThis.ResizeObserver ??=
	ResizeObserverStub as unknown as typeof ResizeObserver;

beforeAll(() => {
	server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
	server.resetHandlers();
	resetMockState();
	cleanup();
});

afterAll(() => {
	server.close();
});
