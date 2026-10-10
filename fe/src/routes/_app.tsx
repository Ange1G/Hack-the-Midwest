import {
	createFileRoute,
	Outlet,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { ApiUnavailable } from "#/components/api-unavailable";
import { AppShell } from "#/components/layout/app-shell";
import { queryKeys } from "#/lib/api/queries";
import { getSessionUser } from "#/lib/api/session";
import { ensureMocksReady } from "#/lib/mocks-ready";

// Authenticated area. Rendered on the client only so the session check and
// the mock API behave the same on a hard refresh and on navigation.
export const Route = createFileRoute("/_app")({
	ssr: false,
	beforeLoad: async ({ context }) => {
		await ensureMocksReady();
		const user = getSessionUser();
		if (!user) {
			throw redirect({ to: "/login" });
		}
		context.queryClient.setQueryData(queryKeys.me, user);
		return { user };
	},
	errorComponent: ({ error, reset }) => (
		<ApiUnavailable error={error} onRetry={reset} />
	),
	component: AppLayout,
});

function AppLayout() {
	const { user } = Route.useRouteContext();
	const navigate = useNavigate();
	return (
		<AppShell user={user} onLoggedOut={() => navigate({ to: "/login" })}>
			<Outlet />
		</AppShell>
	);
}
