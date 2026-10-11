import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { toast } from "sonner";
import { afterAll, afterEach, beforeAll } from "vitest";
import { clearSessionUser } from "#/lib/api/session";
import { resetWatchedRuns } from "#/lib/run-watch";
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

// jsdom does not implement pointer capture; Radix Select calls these on open.
if (typeof Element.prototype.hasPointerCapture !== "function") {
	Element.prototype.hasPointerCapture = () => false;
}
if (typeof Element.prototype.setPointerCapture !== "function") {
	Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
	Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.scrollIntoView !== "function") {
	Element.prototype.scrollIntoView = () => {};
}

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
	resetWatchedRuns();
	clearSessionUser();
	cleanup();
	toast.dismiss();
});

afterAll(() => {
	server.close();
});
