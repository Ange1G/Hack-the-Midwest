import { useSyncExternalStore } from "react";

// In-app notifications. Module state plus useSyncExternalStore, like
// lib/theme.ts: anything can push a toast; components/toaster.tsx shows them.

export type ToastTone = "info" | "success" | "danger";

export type ToastAction = { label: string; onSelect: () => void };

export type ToastInput = {
	title: string;
	description?: string;
	tone?: ToastTone;
	/** How long the toast stays before it closes on its own. */
	durationMs?: number;
	action?: ToastAction;
};

export type ToastItem = {
	id: string;
	/** False while the closing animation plays; the item is removed after it. */
	open: boolean;
	title: string;
	description?: string;
	tone: ToastTone;
	durationMs: number;
	action?: ToastAction;
};

const MAX_TOASTS = 3;
const DEFAULT_DURATION_MS = 8_000;
// Long enough for the closing animation in components/ui/toast.tsx.
const REMOVE_DELAY_MS = 400;

let toasts: ToastItem[] = [];
let counter = 0;
const listeners = new Set<() => void>();

function emit(next: ToastItem[]): void {
	toasts = next;
	for (const listener of listeners) listener();
}

export function toast(input: ToastInput): string {
	counter += 1;
	const id = `toast_${counter}`;
	const item: ToastItem = {
		id,
		open: true,
		title: input.title,
		description: input.description,
		tone: input.tone ?? "info",
		durationMs: input.durationMs ?? DEFAULT_DURATION_MS,
		action: input.action,
	};
	emit([item, ...toasts].slice(0, MAX_TOASTS));
	return id;
}

export function dismissToast(id: string): void {
	if (!toasts.some((item) => item.id === id)) return;
	emit(
		toasts.map((item) => (item.id === id ? { ...item, open: false } : item)),
	);
	window.setTimeout(() => {
		emit(toasts.filter((item) => item.id !== id));
	}, REMOVE_DELAY_MS);
}

export function clearToasts(): void {
	emit([]);
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function useToasts(): ToastItem[] {
	return useSyncExternalStore(
		subscribe,
		() => toasts,
		() => toasts,
	);
}
