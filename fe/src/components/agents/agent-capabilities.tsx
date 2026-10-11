import { useId } from "react";
import { Section } from "#/components/layout/page";
import { FieldError } from "#/components/schedule/field-error";
import { Checkbox } from "#/components/ui/checkbox";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import { useAgents } from "#/lib/api/queries";
import { MAX_DELEGATES_PER_AGENT } from "#/lib/api/schemas";

// The API reports delegate problems per index, e.g. configurations.delegates.2.
function delegateError(errors: Record<string, string>): string | undefined {
	const key = Object.keys(errors).find((name) =>
		name.startsWith("configurations.delegates"),
	);
	return key ? errors[key] : undefined;
}

export function AgentCapabilitiesFields({
	agentId,
	memory,
	onMemory,
	delegates,
	onDelegates,
	errors,
}: {
	agentId?: string;
	memory: boolean;
	onMemory: (memory: boolean) => void;
	delegates: string[];
	onDelegates: (delegates: string[]) => void;
	errors: Record<string, string>;
}) {
	const agents = useAgents();
	const id = useId();
	const candidates = (agents.data?.items ?? []).filter(
		(item) => item.id !== agentId,
	);
	const full = delegates.length >= MAX_DELEGATES_PER_AGENT;
	const error = delegateError(errors);

	const toggle = (delegateId: string, checked: boolean) =>
		onDelegates(
			checked
				? [...delegates, delegateId]
				: delegates.filter((item) => item !== delegateId),
		);

	return (
		<Section
			title="Memory and delegates"
			description="Optional. Let the agent remember facts between runs, and hand subtasks to your other agents."
			contentClassName="space-y-6"
		>
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor={`${id}-memory`}>Memory</Label>
					<p id={`${id}-memory-hint`} className="text-xs text-muted-foreground">
						Gives the agent memory_get and memory_set tools. Saved keys carry
						over to the next run; you can inspect and clear them on the agent
						page.
					</p>
				</div>
				<Switch
					id={`${id}-memory`}
					checked={memory}
					onCheckedChange={onMemory}
					aria-describedby={`${id}-memory-hint`}
				/>
			</div>

			<fieldset className="space-y-2" aria-describedby={`${id}-delegates-hint`}>
				<legend className="text-sm font-medium">Delegates</legend>
				<p
					id={`${id}-delegates-hint`}
					className="text-xs text-muted-foreground"
				>
					Each delegate becomes an ask_… tool this agent can call with a task.
					Up to {MAX_DELEGATES_PER_AGENT}; delegates run with their own
					connectors and instructions.
				</p>
				{agents.isPending ? (
					<p className="text-sm text-muted-foreground">Loading agents…</p>
				) : agents.isError ? (
					<p className="text-sm text-destructive">
						Could not load your agents: {agents.error.message}
					</p>
				) : candidates.length === 0 ? (
					<p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
						Create another agent first to use it as a delegate.
					</p>
				) : (
					<ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
						{candidates.map((candidate) => {
							const checked = delegates.includes(candidate.id);
							const checkboxId = `${id}-delegate-${candidate.id}`;
							return (
								<li
									key={candidate.id}
									className="flex items-center gap-3 px-3 py-2"
								>
									<Checkbox
										id={checkboxId}
										checked={checked}
										disabled={!checked && full}
										onCheckedChange={(value) =>
											toggle(candidate.id, value === true)
										}
										aria-invalid={Boolean(error)}
									/>
									<Label
										htmlFor={checkboxId}
										className="min-w-0 flex-1 cursor-pointer font-normal"
									>
										<span className="block truncate text-sm">
											{candidate.title}
										</span>
										<span className="block truncate text-xs text-muted-foreground">
											{candidate.system_prompt}
										</span>
									</Label>
								</li>
							);
						})}
					</ul>
				)}
				<FieldError message={error} />
			</fieldset>
		</Section>
	);
}
