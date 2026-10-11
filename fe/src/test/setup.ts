import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { clearSessionUser } from "#/lib/api/session";
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

// jsdom has no pointer capture or scrolling; Radix Select calls both when it
// opens and when it focuses the selected item.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

// shadcn sidebar uses matchMedia for mobile layout.
Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: (query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	}),
});

beforeAll(() => {
	server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
	server.resetHandlers();
	server.events.removeAllListeners();
	resetMockState();
	clearSessionUser();
	cleanup();
});

afterAll(() => {
	server.close();
});
