import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "#/components/auth/auth-layout";
import { SignInForm } from "#/components/auth/sign-in-form";
import { ensureMocksReady } from "#/lib/mocks-ready";
import { DEMO_USER_SSO } from "#/mocks/demo-account";

export const Route = createFileRoute("/login")({
	ssr: false,
	beforeLoad: () => ensureMocksReady(),
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	return (
		<AuthLayout
			title="Sign in"
			description="Build, run, and monitor your own agents."
			footer={<p>Your agents, tools, and credentials stay private to you.</p>}
		>
			<SignInForm onSuccess={() => navigate({ to: "/agents" })} />
			{import.meta.env.VITE_USE_MOCKS === "true" ? (
				<p className="mt-4 text-xs text-muted-foreground">
					Mock mode. Any SSO id works; {DEMO_USER_SSO} already has demo data.
				</p>
			) : null}
		</AuthLayout>
	);
}
