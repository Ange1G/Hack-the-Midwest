import type {
	Agent,
	ChainSchedule,
	Execution,
	RunSummary,
} from "#/lib/api/schemas";

export type AgentRunRecord = Pick<
	Execution,
	"id" | "agent_id" | "status" | "created_at"
>;

// The newest execution we have seen for the agent wins over the summary on the
// agent itself, which can lag behind a run started in this session.
export function lastRunFor(
	agent: Agent,
	executions: readonly AgentRunRecord[],
): RunSummary | null {
	let newest: AgentRunRecord | undefined;
	for (const item of executions) {
		if (item.agent_id !== agent.id) continue;
		if (!newest || item.created_at > newest.created_at) newest = item;
	}
	if (newest) {
		return {
			id: newest.id,
			status: newest.status,
			created_at: newest.created_at,
		};
	}
	return agent.last_run;
}

export function recentlyRanAgents(
	agents: readonly Agent[],
	executions: readonly AgentRunRecord[],
	{ limit, exclude }: { limit: number; exclude?: (agent: Agent) => boolean },
): Agent[] {
	return agents
		.filter((agent) => !exclude?.(agent))
		.flatMap((agent) => {
			const last = lastRunFor(agent, executions);
			return last ? [{ agent, at: last.created_at }] : [];
		})
		.sort((a, b) => b.at.localeCompare(a.at))
		.slice(0, limit)
		.map((item) => item.agent);
}

export function flaggedAgents(
	agents: readonly Agent[],
	limit: number,
): Agent[] {
	return agents.filter((agent) => agent.flagged).slice(0, limit);
}

export function newestFirst<T>(
	items: readonly T[],
	timestamp: (item: T) => string,
	limit: number,
): T[] {
	return [...items]
		.sort((a, b) => timestamp(b).localeCompare(timestamp(a)))
		.slice(0, limit);
}

export function isScheduled(
	schedule: ChainSchedule | null | undefined,
): boolean {
	if (!schedule) return false;
	return (
		(schedule.dayOfWeek?.length ?? 0) > 0 ||
		(schedule.timeOfDay?.length ?? 0) > 0 ||
		schedule.month != null
	);
}
