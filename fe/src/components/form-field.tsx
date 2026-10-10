import type { AnyFieldApi } from "@tanstack/react-form";

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

export function FieldErrors({ field, id }: { field: AnyFieldApi; id: string }) {
	const messages = fieldErrorMessages(field);
	if (messages.length === 0) return null;
	return (
		<p id={id} className="text-sm text-destructive">
			{messages[0]}
		</p>
	);
}
