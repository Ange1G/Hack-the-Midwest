import { FormField } from "#/components/form-field";
import { Input } from "#/components/ui/input";
import {
	MAX_RETRIES,
	MAX_TIMEOUT_MS,
	MIN_TIMEOUT_MS,
} from "#/lib/http-contract";
import { TOOL_TYPES, type ToolFieldsProps, toolFieldId } from "./tool-types";

// Retries and timeout share bounds across tool types; the hint explains what
// they apply to for this tool's type.
export function ToolOptionsFields({
	tool,
	readOnly,
	error,
	onChange,
}: ToolFieldsProps) {
	const { retriesHint, timeoutHint } = TOOL_TYPES[tool.type];
	return (
		<div className="grid gap-4 sm:grid-cols-2">
			<FormField
				id={toolFieldId(tool, "retries")}
				label="Retries"
				hint={retriesHint}
				error={error("retries")}
			>
				{(control) => (
					<Input
						{...control}
						type="number"
						inputMode="numeric"
						min={0}
						max={MAX_RETRIES}
						placeholder={`0 to ${MAX_RETRIES}`}
						value={tool.retries}
						onChange={(event) => onChange({ retries: event.target.value })}
						disabled={readOnly}
					/>
				)}
			</FormField>
			<FormField
				id={toolFieldId(tool, "timeout")}
				label="Timeout (ms)"
				hint={timeoutHint}
				error={error("timeout")}
			>
				{(control) => (
					<Input
						{...control}
						type="number"
						inputMode="numeric"
						min={MIN_TIMEOUT_MS}
						max={MAX_TIMEOUT_MS}
						placeholder={`${MIN_TIMEOUT_MS} to ${MAX_TIMEOUT_MS}`}
						value={tool.timeout}
						onChange={(event) => onChange({ timeout: event.target.value })}
						disabled={readOnly}
					/>
				)}
			</FormField>
		</div>
	);
}
