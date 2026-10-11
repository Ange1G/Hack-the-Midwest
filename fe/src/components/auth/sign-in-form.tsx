import { useForm } from "@tanstack/react-form";
import { FieldErrors, fieldErrorMessages } from "#/components/form-field";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useSignIn } from "#/lib/api/queries";
import { signInInputSchema } from "#/lib/api/schemas";
import type { User } from "#/lib/api/session";

export function SignInForm({ onSuccess }: { onSuccess: (user: User) => void }) {
	const signIn = useSignIn();
	const form = useForm({
		defaultValues: { user_sso: "" },
		validators: { onSubmit: signInInputSchema },
		onSubmit: ({ value }) =>
			// Pass only the identity on, never the raw form value.
			signIn.mutate(value, { onSuccess: (user) => onSuccess(user) }),
	});

	return (
		<form
			noValidate
			className="space-y-4"
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<form.Field name="user_sso">
				{(field) => (
					<div className="space-y-1.5">
						<Label htmlFor="sign-in-sso">SSO id</Label>
						<Input
							id="sign-in-sso"
							name={field.name}
							autoComplete="username"
							autoCapitalize="off"
							spellCheck={false}
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(event) => field.handleChange(event.target.value)}
							aria-invalid={fieldErrorMessages(field).length > 0}
							aria-describedby="sign-in-sso-error sign-in-sso-help"
						/>
						<FieldErrors field={field} id="sign-in-sso-error" />
						<p id="sign-in-sso-help" className="text-xs text-muted-foreground">
							Development sign-in: the API trusts this id through the
							X-Dev-User-SSO header until real authentication lands.
						</p>
					</div>
				)}
			</form.Field>

			{signIn.error ? (
				<p role="alert" className="text-sm text-destructive">
					{signIn.error.message}
				</p>
			) : null}

			<Button type="submit" className="w-full" disabled={signIn.isPending}>
				{signIn.isPending ? "Checking…" : "Sign in"}
			</Button>
		</form>
	);
}
