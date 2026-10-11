import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getTheme,
	initTheme,
	setTheme,
	THEME_BOOT_SCRIPT,
	THEME_STORAGE_KEY,
	toggleTheme,
} from "./theme";

const root = () => document.documentElement;

describe("theme", () => {
	afterEach(() => {
		Reflect.deleteProperty(document, "startViewTransition");
		Reflect.deleteProperty(root(), "animate");
		vi.restoreAllMocks();
	});

	it("defaults to light", () => {
		expect(getTheme()).toBe("light");
		expect(root()).not.toHaveClass("dark");
	});

	it("applies dark on <html> and remembers it for the next visit", () => {
		setTheme("dark");

		expect(root()).toHaveClass("dark");
		expect(getTheme()).toBe("dark");
		expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

		setTheme("light");
		expect(root()).not.toHaveClass("dark");
		expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
	});

	it("restores the remembered theme and ignores values it does not know", () => {
		window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
		expect(initTheme()).toBe("dark");
		expect(root()).toHaveClass("dark");

		window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
		expect(initTheme()).toBe("light");
		expect(root()).not.toHaveClass("dark");
	});

	it("the boot script applies a remembered dark theme before React runs", () => {
		window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
		new Function(THEME_BOOT_SCRIPT)();
		expect(root()).toHaveClass("dark");
	});

	it("toggles directly when the browser has no view transitions", () => {
		expect(toggleTheme()).toBe("dark");
		expect(root()).toHaveClass("dark");
		expect(toggleTheme()).toBe("light");
		expect(root()).not.toHaveClass("dark");
	});

	it("reveals the new theme with a circle growing from the toggle", async () => {
		const ready = Promise.resolve();
		const finished = Promise.resolve();
		const start = vi.fn((update: () => void) => {
			update();
			return { ready, finished };
		});
		Object.assign(document, { startViewTransition: start });
		const animate = vi.fn();
		Object.assign(root(), { animate });

		expect(toggleTheme({ x: 10, y: 20 })).toBe("dark");
		// Only the root takes part while the circle grows: the page area's own
		// transition is switched off through this class (styles.css).
		expect(root()).toHaveClass("theme-switching");
		await ready;
		await finished;
		await Promise.resolve();
		expect(root()).not.toHaveClass("theme-switching");

		expect(start).toHaveBeenCalledOnce();
		expect(root()).toHaveClass("dark");
		expect(animate).toHaveBeenCalledWith(
			{
				clipPath: [
					"circle(0px at 10px 20px)",
					expect.stringMatching(/^circle\(\d+(\.\d+)?px at 10px 20px\)$/),
				],
			},
			expect.objectContaining({ pseudoElement: "::view-transition-new(root)" }),
		);
	});

	it("switches without animation when the user prefers reduced motion", () => {
		const start = vi.fn();
		Object.assign(document, { startViewTransition: start });
		vi.spyOn(window, "matchMedia").mockImplementation(
			(query: string) =>
				({
					matches: query.includes("prefers-reduced-motion"),
					media: query,
				}) as MediaQueryList,
		);

		expect(toggleTheme({ x: 0, y: 0 })).toBe("dark");

		expect(start).not.toHaveBeenCalled();
		expect(root()).toHaveClass("dark");
		expect(root()).not.toHaveClass("theme-switching");
	});
});
