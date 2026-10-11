import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ApiUnavailable } from "#/components/api-unavailable";
import { AppShell } from "#/components/layout/app-shell";
import { getCurrentUser } from "#/lib/api/identity";
import { ensureMocksReady } from "#/lib/mocks-ready";

// Application area. Rendered on the client only so the mock API behaves the
// same on a hard refresh and on navigation.
export const Route = createFileRoute("/_app")({
	ssr: false,
	beforeLoad: async () => {
		await ensureMocksReady();
		return { user: getCurrentUser() };
	},
	errorComponent: ({ error, reset }) => (
		<ApiUnavailable error={error} onRetry={reset} />
	),
	component: AppLayout,
});

function AppLayout() {
	const { user } = Route.useRouteContext();
	return (
		<AppShell user={user}>
			<Outlet />
		</AppShell>
	);
}
