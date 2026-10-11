import { FormField } from "#/components/form-field";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { MAX_DESCRIPTION_LENGTH } from "#/lib/http-contract";
import { TOOL_TYPES, type ToolFieldsProps, toolFieldId } from "./tool-types";

export function McpToolFields({
	tool,
	readOnly,
	error,
	onChange,
}: ToolFieldsProps) {
	return (
		<>
			<FormField
				id={toolFieldId(tool, "url")}
				label={TOOL_TYPES.mcp.urlLabel}
				hint="A remote server using the Streamable HTTP transport. Local (stdio) servers are not supported."
				error={error("url")}
			>
				{(control) => (
					<Input
						{...control}
						type="url"
						placeholder={TOOL_TYPES.mcp.urlPlaceholder}
						value={tool.url}
						onChange={(event) => onChange({ url: event.target.value })}
						disabled={readOnly}
					/>
				)}
			</FormField>
			<FormField
				id={toolFieldId(tool, "description")}
				label="Description (optional)"
				hint="Tells the agent what this server is for."
				error={error("description")}
			>
				{(control) => (
					<Textarea
						{...control}
						rows={2}
						maxLength={MAX_DESCRIPTION_LENGTH}
						placeholder="Issue tracker for the web team"
						value={tool.description}
						onChange={(event) => onChange({ description: event.target.value })}
						disabled={readOnly}
					/>
				)}
			</FormField>
		</>
	);
}
