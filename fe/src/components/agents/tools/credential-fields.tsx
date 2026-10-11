import type { CredentialField } from "#/components/agents/agent-form-model";
import { FormField } from "#/components/form-field";
import { Input } from "#/components/ui/input";
import { type ToolFieldsProps, toolFieldId } from "./tool-types";

const CREDENTIALS: {
	field: CredentialField;
	label: string;
	placeholder?: string;
}[] = [
	{ field: "xApiKey", label: "API key" },
	{
		field: "authorizationHeader",
		label: "Authorization header",
		placeholder: "Bearer …",
	},
];

// Write-only: inputs start empty even when a credential is stored, so a stored
// secret never reaches the DOM. The hint says a value exists instead.
export function CredentialFields({
	tool,
	readOnly,
	error,
	onChange,
}: ToolFieldsProps) {
	return (
		<div className="grid gap-4 sm:grid-cols-2">
			{CREDENTIALS.map(({ field, label, placeholder }) => (
				<FormField
					key={field}
					id={toolFieldId(tool, field)}
					label={label}
					hint={
						tool.storedCredentials[field]
							? readOnly
								? "A value is stored and hidden."
								: "A value is stored and hidden. Enter a new one to replace it."
							: undefined
					}
					error={error(field)}
				>
					{(control) => (
						<Input
							{...control}
							type="password"
							autoComplete="off"
							placeholder={placeholder}
							value={tool[field]}
							onChange={(event) =>
								onChange(
									field === "xApiKey"
										? { xApiKey: event.target.value }
										: { authorizationHeader: event.target.value },
								)
							}
							disabled={readOnly}
						/>
					)}
				</FormField>
			))}
		</div>
	);
}
