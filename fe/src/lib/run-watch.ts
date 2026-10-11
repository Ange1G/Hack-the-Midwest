import { useSyncExternalStore } from "react";

// Ids of the runs started in this session, so the app can announce how each
// one ends wherever the person is (components/runs/run-notifications.tsx).

let watched: string[] = [];
const listeners = new Set<() => void>();

function emit(next: string[]): void {
	watched = next;
	for (const listener of listeners) listener();
}

export function watchRun(id: string): void {
	if (watched.includes(id)) return;
	emit([...watched, id]);
}

export function unwatchRun(id: string): void {
	if (!watched.includes(id)) return;
	emit(watched.filter((item) => item !== id));
}

export function getWatchedRuns(): string[] {
	return watched;
}

export function clearWatchedRuns(): void {
	emit([]);
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function useWatchedRuns(): string[] {
	return useSyncExternalStore(
		subscribe,
		() => watched,
		() => watched,
	);
}
