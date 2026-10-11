import { FormField } from "#/components/form-field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { toolTypeSchema } from "#/lib/api/schemas";
import {
	TOOL_TYPE_ORDER,
	TOOL_TYPES,
	type ToolFieldsProps,
	toolFieldId,
} from "./tool-types";

export function ToolTypeSelect({
	tool,
	readOnly,
	error,
	onChange,
}: ToolFieldsProps) {
	return (
		<FormField
			id={toolFieldId(tool, "type")}
			label="Tool type"
			hint={TOOL_TYPES[tool.type].description}
			error={error("type")}
		>
			{(control) => (
				<Select
					value={tool.type}
					disabled={readOnly}
					onValueChange={(value) => {
						const type = toolTypeSchema.safeParse(value);
						if (type.success) onChange({ type: type.data });
					}}
				>
					<SelectTrigger {...control} className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{TOOL_TYPE_ORDER.map((type) => (
							<SelectItem key={type} value={type}>
								{TOOL_TYPES[type].label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
		</FormField>
	);
}
