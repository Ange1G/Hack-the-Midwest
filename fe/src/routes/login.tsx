import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "#/components/auth/auth-layout";
import { LoginForm } from "#/components/auth/login-form";
import { ensureMocksReady } from "#/lib/mocks-ready";
import { DEMO_EMAIL, DEMO_PASSWORD } from "#/mocks/demo-account";

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
			footer={
				<p>
					New here? <Link to="/signup">Create an account</Link>
				</p>
			}
		>
			<LoginForm onSuccess={() => navigate({ to: "/agents" })} />
			{import.meta.env.VITE_USE_MOCKS === "true" ? (
				<p className="mt-4 text-xs text-muted-foreground">
					Mock mode. Demo account: {DEMO_EMAIL} / {DEMO_PASSWORD}, or sign up
					with any email to start from scratch.
				</p>
			) : null}
		</AuthLayout>
	);
}
