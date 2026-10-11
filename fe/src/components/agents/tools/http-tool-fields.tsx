import { FormField } from "#/components/form-field";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { httpMethodSchema } from "#/lib/api/schemas";
import { HTTP_METHOD_OPTIONS } from "#/lib/http-contract";
import { TOOL_TYPES, type ToolFieldsProps, toolFieldId } from "./tool-types";

export function HttpToolFields({
	tool,
	readOnly,
	error,
	onChange,
}: ToolFieldsProps) {
	return (
		<>
			<div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
				<FormField id={toolFieldId(tool, "method")} label="Method">
					{(control) => (
						<Select
							value={tool.method}
							disabled={readOnly}
							onValueChange={(value) => {
								const method = httpMethodSchema.safeParse(value);
								if (method.success) onChange({ method: method.data });
							}}
						>
							<SelectTrigger {...control} className="w-full font-mono">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{HTTP_METHOD_OPTIONS.map((option) => (
									<SelectItem
										key={option.value}
										value={option.value}
										disabled={!option.supported}
										className="font-mono"
									>
										{option.value}
										{option.supported ? null : (
											<span className="font-sans text-xs text-muted-foreground">
												not supported yet
											</span>
										)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</FormField>
				<FormField
					id={toolFieldId(tool, "url")}
					label={TOOL_TYPES.http.urlLabel}
					error={error("url")}
				>
					{(control) => (
						<Input
							{...control}
							type="url"
							placeholder={TOOL_TYPES.http.urlPlaceholder}
							value={tool.url}
							onChange={(event) => onChange({ url: event.target.value })}
							disabled={readOnly}
						/>
					)}
				</FormField>
			</div>

			{tool.method === "POST" ? (
				<FormField
					id={toolFieldId(tool, "payload")}
					label="Payload (JSON)"
					error={error("payload")}
				>
					{(control) => (
						<Textarea
							{...control}
							rows={3}
							placeholder='{"text": "digest ready"}'
							className="font-mono text-xs"
							value={tool.payload}
							onChange={(event) => onChange({ payload: event.target.value })}
							disabled={readOnly}
						/>
					)}
				</FormField>
			) : null}
		</>
	);
}
