import { useForm } from "@tanstack/react-form";
import { FieldErrors, fieldErrorMessages } from "#/components/form-field";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { type Credentials, credentialsSchema } from "#/lib/api/schemas";

type Props = {
	submitLabel: string;
	passwordAutoComplete: "current-password" | "new-password";
	pending: boolean;
	error: Error | null;
	onSubmit: (credentials: Credentials) => void;
};

export function CredentialsForm({
	submitLabel,
	passwordAutoComplete,
	pending,
	error,
	onSubmit,
}: Props) {
	const form = useForm({
		defaultValues: { email: "", password: "" },
		validators: { onSubmit: credentialsSchema },
		onSubmit: ({ value }) => onSubmit(value),
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
			<form.Field name="email">
				{(field) => (
					<div className="space-y-1.5">
						<Label htmlFor="credentials-email">Email</Label>
						<Input
							id="credentials-email"
							name={field.name}
							type="email"
							autoComplete="email"
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(event) => field.handleChange(event.target.value)}
							aria-invalid={fieldErrorMessages(field).length > 0}
							aria-describedby="credentials-email-error"
						/>
						<FieldErrors field={field} id="credentials-email-error" />
					</div>
				)}
			</form.Field>

			<form.Field name="password">
				{(field) => (
					<div className="space-y-1.5">
						<Label htmlFor="credentials-password">Password</Label>
						<Input
							id="credentials-password"
							name={field.name}
							type="password"
							autoComplete={passwordAutoComplete}
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(event) => field.handleChange(event.target.value)}
							aria-invalid={fieldErrorMessages(field).length > 0}
							aria-describedby="credentials-password-error"
						/>
						<FieldErrors field={field} id="credentials-password-error" />
					</div>
				)}
			</form.Field>

			{error ? (
				<p role="alert" className="text-sm text-destructive">
					{error.message}
				</p>
			) : null}

			<Button type="submit" className="w-full" disabled={pending}>
				{pending ? "Please wait…" : submitLabel}
			</Button>
		</form>
	);
}
