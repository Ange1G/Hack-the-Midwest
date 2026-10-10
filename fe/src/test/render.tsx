import { QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { createTestQueryClient } from "./query";

type Options = {
	path?: string;
	queryClient?: ReturnType<typeof createTestQueryClient>;
};

// Renders a component inside a real router (memory history) and a fresh
// QueryClient, so Links, navigation, and hooks behave as they do in the app.
export function renderWithProviders(
	ui: ReactNode,
	{ path = "/", queryClient = createTestQueryClient() }: Options = {},
) {
	const rootRoute = createRootRoute({ component: () => ui });
	const router = createRouter({
		routeTree: rootRoute,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	const view = render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
	return { ...view, router, queryClient };
}
