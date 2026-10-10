import { useSignup } from "#/lib/api/queries";
import type { User } from "#/lib/api/schemas";
import { CredentialsForm } from "./credentials-form";

export function SignupForm({ onSuccess }: { onSuccess: (user: User) => void }) {
	const signup = useSignup();
	return (
		<CredentialsForm
			submitLabel="Create account"
			passwordAutoComplete="new-password"
			pending={signup.isPending}
			error={signup.error}
			onSubmit={(credentials) =>
				// Pass only the user on, never the submitted credentials.
				signup.mutate(credentials, { onSuccess: (user) => onSuccess(user) })
			}
		/>
	);
}
