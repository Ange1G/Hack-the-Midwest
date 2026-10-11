import { useSyncExternalStore } from "react";

// Runs the user started (or is watching) in this tab and that were last seen
// queued or running. The app-wide RunWatcher polls each one and reports its
// outcome once, wherever the user is in the app.
let watched: readonly string[] = [];
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

export function watchRun(runId: string): void {
	if (watched.includes(runId)) return;
	watched = [...watched, runId];
	emit();
}

export function unwatchRun(runId: string): void {
	if (!watched.includes(runId)) return;
	watched = watched.filter((id) => id !== runId);
	emit();
}

export function resetWatchedRuns(): void {
	watched = [];
	emit();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

const snapshot = () => watched;

export function useWatchedRuns(): readonly string[] {
	return useSyncExternalStore(subscribe, snapshot, snapshot);
}
