import {
	emptyTool,
	type FormErrors,
	type ToolDraft,
	toolErrorKey,
} from "#/components/agents/agent-form-model";
import { Button } from "#/components/ui/button";
import { ToolCard } from "./tool-card";

export function ToolsSection({
	tools,
	errors,
	readOnly,
	onChange,
}: {
	tools: ToolDraft[];
	errors: FormErrors;
	readOnly: boolean;
	onChange: (update: (tools: ToolDraft[]) => ToolDraft[]) => void;
}) {
	const patchTool = (key: number, patch: Partial<ToolDraft>) =>
		onChange((previous) =>
			previous.map((tool) => (tool.key === key ? { ...tool, ...patch } : tool)),
		);

	return (
		<section className="space-y-3" aria-labelledby="tools-heading">
			<div>
				<h2 id="tools-heading" className="text-base font-semibold">
					Tools
				</h2>
				<p className="text-sm text-muted-foreground">
					Each tool is something the agent may use: an HTTP request or a
					remote MCP server you provide. Credentials are encrypted at rest and
					never shown again. Private and internal addresses are refused.
				</p>
			</div>
			{tools.map((tool, index) => (
				<ToolCard
					key={tool.key}
					position={index + 1}
					tool={tool}
					readOnly={readOnly}
					error={(field) => errors[toolErrorKey(index, field)]}
					onChange={(patch) => patchTool(tool.key, patch)}
					onRemove={
						readOnly
							? undefined
							: () =>
									onChange((previous) =>
										previous.filter((item) => item.key !== tool.key),
									)
					}
				/>
			))}
			{readOnly ? null : (
				<Button
					type="button"
					variant="outline"
					onClick={() => onChange((previous) => [...previous, emptyTool()])}
				>
					Add tool
				</Button>
			)}
		</section>
	);
}
