import type { AnyFieldApi } from "@tanstack/react-form";
import type { ReactNode } from "react";
import { Label } from "#/components/ui/label";

export function fieldErrorMessages(field: AnyFieldApi): string[] {
	return field.state.meta.errors
		.map((error: unknown) => {
			if (typeof error === "string") return error;
			if (error && typeof error === "object" && "message" in error) {
				return String((error as { message: unknown }).message);
			}
			return "";
		})
		.filter((message) => message.length > 0);
}

export function FieldError({
	id,
	message,
}: {
	id?: string;
	message: string | undefined;
}) {
	return message ? (
		<p id={id} className="text-sm text-destructive">
			{message}
		</p>
	) : null;
}

export function FieldErrors({ field, id }: { field: AnyFieldApi; id: string }) {
	return <FieldError id={id} message={fieldErrorMessages(field)[0]} />;
}

export type FormControlProps = {
	id: string;
	"aria-invalid": boolean;
	"aria-describedby"?: string;
};

// Label, optional hint and error around one control. The control is rendered
// by the caller so any input (Input, Textarea, Select trigger) can be used; it
// receives the props that tie it to its label, hint and error.
export function FormField({
	id,
	label,
	hint,
	error,
	children,
}: {
	id: string;
	label: ReactNode;
	hint?: ReactNode;
	error?: string;
	children: (control: FormControlProps) => ReactNode;
}) {
	const hintId = hint ? `${id}-hint` : undefined;
	const errorId = error ? `${id}-error` : undefined;
	const describedBy = [hintId, errorId].filter(Boolean).join(" ");
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>{label}</Label>
			{children({
				id,
				"aria-invalid": Boolean(error),
				...(describedBy ? { "aria-describedby": describedBy } : {}),
			})}
			{hint ? (
				<p id={hintId} className="text-xs text-muted-foreground">
					{hint}
				</p>
			) : null}
			<FieldError id={errorId} message={error} />
		</div>
	);
}
