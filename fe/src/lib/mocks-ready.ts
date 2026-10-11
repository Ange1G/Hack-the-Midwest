let ready: Promise<void> | undefined;

// Starts the browser mock API once when VITE_USE_MOCKS=true. In any other
// build the dynamic import is unreachable, so msw is never bundled.
export function ensureMocksReady(): Promise<void> {
	if (
		import.meta.env.VITE_USE_MOCKS !== "true" ||
		typeof window === "undefined"
	) {
		return Promise.resolve();
	}
	ready ??= import("#/mocks/browser").then((module) =>
		module.startMockWorker(),
	);
	return ready;
}
