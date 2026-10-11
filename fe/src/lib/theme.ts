import { useSyncExternalStore } from "react";

// Light is the default and the look the app was designed in; dark is opt-in and
// remembered per browser. The `dark` class on <html> is the single source of
// truth because the Tailwind dark variant is `&:is(.dark *)` (styles.css).

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "agent-platform.theme";
const DEFAULT_THEME: Theme = "light";
const REVEAL_MS = 600;

// Runs inline in <head> (routes/__root.tsx) so a remembered dark theme is in
// place before the first paint instead of flashing light first.
export const THEME_BOOT_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="dark"){document.documentElement.classList.add("dark")}}catch(e){}})()`;

const listeners = new Set<() => void>();

function isTheme(value: unknown): value is Theme {
	return value === "light" || value === "dark";
}

function storedTheme(): Theme {
	try {
		const value = window.localStorage.getItem(THEME_STORAGE_KEY);
		return isTheme(value) ? value : DEFAULT_THEME;
	} catch {
		return DEFAULT_THEME;
	}
}

export function getTheme(): Theme {
	if (typeof document === "undefined") return DEFAULT_THEME;
	return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(theme: Theme): void {
	document.documentElement.classList.toggle("dark", theme === "dark");
	try {
		window.localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		// Storage can be unavailable (private mode); the theme then lasts for
		// this page only.
	}
	for (const listener of listeners) listener();
}

// Applies the remembered theme and returns it.
export function initTheme(): Theme {
	const theme = storedTheme();
	setTheme(theme);
	return theme;
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function useTheme(): Theme {
	return useSyncExternalStore(subscribe, getTheme, () => DEFAULT_THEME);
}

type ViewTransitionDocument = Document & {
	startViewTransition(update: () => void): { ready: Promise<void> };
};

// Switches theme. Where the browser supports view transitions and the person
// has not asked for reduced motion, the new theme is revealed by a circle
// growing from `origin` (the toggle) to the farthest corner of the viewport.
export function toggleTheme(origin?: { x: number; y: number }): Theme {
	const next: Theme = getTheme() === "dark" ? "light" : "dark";
	const doc = document as ViewTransitionDocument;
	const reducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches;
	if (reducedMotion || typeof doc.startViewTransition !== "function") {
		setTheme(next);
		return next;
	}

	const x = origin?.x ?? window.innerWidth / 2;
	const y = origin?.y ?? window.innerHeight / 2;
	const radius = Math.hypot(
		Math.max(x, window.innerWidth - x),
		Math.max(y, window.innerHeight - y),
	);
	const transition = doc.startViewTransition(() => setTheme(next));
	transition.ready.then(
		() => {
			document.documentElement.animate(
				{
					clipPath: [
						`circle(0px at ${x}px ${y}px)`,
						`circle(${radius}px at ${x}px ${y}px)`,
					],
				},
				{
					duration: REVEAL_MS,
					easing: "cubic-bezier(0.22, 1, 0.36, 1)",
					pseudoElement: "::view-transition-new(root)",
				},
			);
		},
		// The transition was skipped (for example a second switch started);
		// the theme itself is already applied.
		() => undefined,
	);
	return next;
}
