import type { ComponentType } from "react";
import { FormField } from "#/components/form-field";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import type { ToolType } from "#/lib/api/schemas";
import { PRIMITIVE_NAME_MESSAGE } from "#/lib/http-contract";
import { CredentialFields } from "./credential-fields";
import { HttpToolFields } from "./http-tool-fields";
import { McpToolFields } from "./mcp-tool-fields";
import { ToolOptionsFields } from "./tool-options-fields";
import { ToolTypeSelect } from "./tool-type-select";
import { TOOL_TYPES, type ToolFieldsProps, toolFieldId } from "./tool-types";

// The fields that only one tool type has. Adding a type means adding one
// entry here and one in TOOL_TYPES.
const TYPE_FIELDS: Record<ToolType, ComponentType<ToolFieldsProps>> = {
	http: HttpToolFields,
	mcp: McpToolFields,
};

export function ToolCard({
	position,
	onRemove,
	...props
}: ToolFieldsProps & { position: number; onRemove?: () => void }) {
	const { tool, readOnly, error, onChange } = props;
	const TypeFields = TYPE_FIELDS[tool.type];
	return (
		<fieldset className="island-shell space-y-4 rounded-xl p-4">
			<legend className="px-1 font-medium">Tool {position}</legend>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="island-kicker">{TOOL_TYPES[tool.type].label}</span>
				{onRemove ? (
					<Button type="button" variant="outline" size="sm" onClick={onRemove}>
						Remove tool {position}
					</Button>
				) : null}
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<ToolTypeSelect {...props} />
				<FormField
					id={toolFieldId(tool, "name")}
					label="Tool name"
					hint={PRIMITIVE_NAME_MESSAGE}
					error={error("name")}
				>
					{(control) => (
						<Input
							{...control}
							placeholder={
								tool.type === "mcp" ? "issue_tracker" : "list_issues"
							}
							autoCapitalize="off"
							spellCheck={false}
							value={tool.name}
							onChange={(event) => onChange({ name: event.target.value })}
							disabled={readOnly}
						/>
					)}
				</FormField>
			</div>

			<TypeFields {...props} />
			<CredentialFields {...props} />
			<ToolOptionsFields {...props} />
		</fieldset>
	);
}
