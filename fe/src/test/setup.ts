import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { resetCurrentUser } from "#/lib/api/identity";
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
	resetCurrentUser();
	// The theme lives on <html> and in localStorage, outside React's tree.
	document.documentElement.classList.remove("dark", "theme-switching");
	window.localStorage.clear();
	cleanup();
});

afterAll(() => {
	server.close();
});
