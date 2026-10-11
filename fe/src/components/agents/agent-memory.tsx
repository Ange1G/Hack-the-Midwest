import { Link } from "@tanstack/react-router";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { Section } from "#/components/layout/page";
import { RelativeTime } from "#/components/relative-time";
import { ErrorState } from "#/components/states";
import { Button } from "#/components/ui/button";
import { useAgentMemory, useAgents, useDeleteMemory } from "#/lib/api/queries";
import { notify } from "#/lib/feedback";
import { textLinkClass } from "#/lib/styles";

function formatValue(value: unknown): string {
	return typeof value === "string" ? value : JSON.stringify(value);
}

// What a memory-enabled agent has saved for its next runs.
export function AgentMemoryPanel({ agentId }: { agentId: string }) {
	const memory = useAgentMemory(agentId);
	const remove = useDeleteMemory(agentId);
	const entries = memory.data ?? [];
	const clearing = remove.isPending && remove.variables === undefined;

	const deleteKey = (key?: string) =>
		remove.mutate(key, {
			onSuccess: () => notify.success(key ? `Forgot ${key}` : "Memory cleared"),
			onError: (error) => notify.error("Could not update memory", error),
		});

	return (
		<Section
			title="Memory"
			description={
				memory.data
					? `${entries.length} saved ${entries.length === 1 ? "key" : "keys"}. The agent reads them at the start of each run.`
					: undefined
			}
			contentClassName="p-0"
			action={
				entries.length > 0 ? (
					<Button
						type="button"
						variant="ghost"
						size="xs"
						disabled={remove.isPending}
						onClick={() => deleteKey()}
					>
						{clearing ? (
							<Loader2Icon className="animate-spin" aria-hidden="true" />
						) : null}
						Clear all
					</Button>
				) : null
			}
		>
			{memory.isPending ? (
				<p className="p-4 text-sm text-muted-foreground">Loading memory…</p>
			) : memory.isError ? (
				<div className="p-4">
					<ErrorState
						title="Could not load memory"
						error={memory.error}
						onRetry={() => void memory.refetch()}
					/>
				</div>
			) : entries.length === 0 ? (
				<p className="p-4 text-sm text-muted-foreground">
					Nothing saved yet. The agent saves keys with memory_set during a run.
				</p>
			) : (
				<ul className="divide-y">
					{entries.map((entry) => {
						const value = formatValue(entry.value);
						const pending = remove.isPending && remove.variables === entry.key;
						return (
							<li
								key={entry.key}
								className="flex items-start gap-3 px-4 py-2.5"
							>
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-baseline gap-x-2">
										<code className="text-sm font-medium">{entry.key}</code>
										<RelativeTime
											iso={entry.updated_at}
											className="text-xs text-muted-foreground"
										/>
									</div>
									<p
										className="line-clamp-2 font-mono text-xs break-all text-muted-foreground"
										title={value}
									>
										{value}
									</p>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label={`Forget ${entry.key}`}
									disabled={remove.isPending}
									onClick={() => deleteKey(entry.key)}
								>
									{pending ? (
										<Loader2Icon className="animate-spin" aria-hidden="true" />
									) : (
										<Trash2Icon aria-hidden="true" />
									)}
								</Button>
							</li>
						);
					})}
				</ul>
			)}
		</Section>
	);
}

export function AgentDelegatesList({ delegateIds }: { delegateIds: string[] }) {
	const agents = useAgents();
	const byId = new Map(
		(agents.data?.items ?? []).map((item) => [item.id, item]),
	);
	return (
		<Section
			title="Delegates"
			description="Agents this one can hand subtasks to with its ask_… tools."
			contentClassName="p-0"
		>
			<ul className="divide-y">
				{delegateIds.map((delegateId) => {
					const delegate = byId.get(delegateId);
					return (
						<li key={delegateId} className="px-4 py-2.5 text-sm">
							{delegate ? (
								<Link
									to="/agents/$agentId"
									params={{ agentId: delegateId }}
									className={textLinkClass}
								>
									{delegate.title}
								</Link>
							) : (
								<span className="text-muted-foreground">
									{agents.isPending ? "Loading…" : "Deleted agent"}
								</span>
							)}
						</li>
					);
				})}
			</ul>
		</Section>
	);
}
