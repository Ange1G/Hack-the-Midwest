import { FieldError } from "#/components/schedule/field-error";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useConnectorTools } from "#/lib/api/queries";

export function parseAllowedTools(value: string): string[] {
	const names: string[] = [];
	for (const part of value.split(",")) {
		const name = part.trim();
		if (!name || names.includes(name)) continue;
		names.push(name);
	}
	return names;
}

function setTool(current: string, name: string, enabled: boolean): string {
	const names = parseAllowedTools(current);
	const next = enabled
		? names.includes(name)
			? names
			: [...names, name]
		: names.filter((item) => item !== name);
	return next.join(", ");
}

export function McpAllowedToolsField({
	connectorId,
	value,
	onChange,
	error,
	idPrefix,
}: {
	connectorId?: string;
	value: string;
	onChange: (value: string) => void;
	error?: string;
	idPrefix: string;
}) {
	const preview = useConnectorTools(connectorId);
	const advertised = preview.data?.tools ?? [];
	const selected = new Set(parseAllowedTools(value));

	return (
		<div className="space-y-3">
			{connectorId && preview.isPending ? (
				<p className="text-sm text-muted-foreground">Loading tools…</p>
			) : null}
			{advertised.length > 0 ? (
				<fieldset className="space-y-2">
					<legend className="text-sm font-medium">Allowed tools</legend>
					<p className="text-xs text-muted-foreground">
						Tools advertised by this MCP server. Pick at least one.
					</p>
					<div className="flex flex-col gap-1">
						{advertised.map((name) => {
							const id = `${idPrefix}-tool-${name}`;
							return (
								<div key={name} className="flex min-h-11 items-center gap-2">
									<Checkbox
										id={id}
										checked={selected.has(name)}
										onCheckedChange={(checked) =>
											onChange(setTool(value, name, checked === true))
										}
									/>
									<Label htmlFor={id} className="font-mono text-xs">
										{name}
									</Label>
								</div>
							);
						})}
					</div>
				</fieldset>
			) : null}
			<div className="space-y-1.5">
				<Label htmlFor={`${idPrefix}-tools`}>
					{advertised.length > 0
						? "Additional tools (comma separated)"
						: "Allowed tools (comma separated)"}
				</Label>
				<Input
					id={`${idPrefix}-tools`}
					placeholder="search_issues, get_issue"
					className="font-mono text-xs"
					value={value}
					onChange={(event) => onChange(event.target.value)}
					aria-invalid={Boolean(error)}
				/>
				{connectorId && preview.isError ? (
					<p className="text-xs text-muted-foreground">
						Could not list tools from the server. Type the names this agent
						may call.
					</p>
				) : null}
				<FieldError message={error} />
			</div>
		</div>
	);
}
