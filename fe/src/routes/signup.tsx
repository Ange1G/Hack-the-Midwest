import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "#/components/auth/auth-layout";
import { SignupForm } from "#/components/auth/signup-form";
import { ensureMocksReady } from "#/lib/mocks-ready";
import { textLinkClass } from "#/lib/styles";

export const Route = createFileRoute("/signup")({
	ssr: false,
	beforeLoad: () => ensureMocksReady(),
	component: SignupPage,
});

function SignupPage() {
	const navigate = useNavigate();
	return (
		<AuthLayout
			title="Create your account"
			description="Your agents, tools, and credentials stay private to you."
			footer={
				<p>
					Already have an account?{" "}
					<Link to="/login" className={textLinkClass}>
						Sign in
					</Link>
				</p>
			}
		>
			<SignupForm onSuccess={() => navigate({ to: "/agents" })} />
		</AuthLayout>
	);
}
