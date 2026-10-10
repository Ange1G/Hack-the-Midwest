import { useLogin } from "#/lib/api/queries";
import type { User } from "#/lib/api/schemas";
import { CredentialsForm } from "./credentials-form";

export function LoginForm({ onSuccess }: { onSuccess: (user: User) => void }) {
	const login = useLogin();
	return (
		<CredentialsForm
			submitLabel="Sign in"
			passwordAutoComplete="current-password"
			pending={login.isPending}
			error={login.error}
			onSubmit={(credentials) =>
				// Pass only the user on: the mutation callback also receives the
				// submitted credentials, which must not travel any further.
				login.mutate(credentials, { onSuccess: (user) => onSuccess(user) })
			}
		/>
	);
}
