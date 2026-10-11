import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { ApiError } from "#/lib/api/client";
import { ensureMocksReady } from "#/lib/mocks-ready";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				// Client errors (auth, validation, not found) will not fix themselves.
				retry: (failureCount, error) =>
					failureCount < 2 &&
					!(
						error instanceof ApiError &&
						error.status > 0 &&
						error.status < 500
					),
				staleTime: 5_000,
			},
		},
	});

	if (typeof window !== "undefined") {
		void ensureMocksReady();
	}

	const router = createTanStackRouter({
		routeTree,
		context: { queryClient },
		scrollRestoration: true,
		// Route changes animate the page area (styles.css, .page-view); the
		// router skips this where the browser has no View Transitions API.
		defaultViewTransition: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		Wrap: ({ children }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		),
	});

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
