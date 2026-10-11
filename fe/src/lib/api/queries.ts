import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { ApiError, api } from "./client";
import { getCurrentUser } from "./identity";
import {
	type Agent,
	type AgentInput,
	agentSchema,
	type Run,
	type RunStatus,
	runEventSchema,
	runSchema,
} from "./schemas";

export type PollOptions = { pollIntervalMs?: number };

export const ACTIVE_RUN_POLL_MS = 1500;

// Lists request one bounded page: the backend caps page_size at 100.
const LIST_PAGE_SIZE = 100;

export const queryKeys = {
	agents: ["agents"] as const,
	agent: (id: string) => ["agents", id] as const,
	agentRuns: (id: string) => ["agents", id, "runs"] as const,
	run: (id: string) => ["runs", id] as const,
	runEvents: (id: string) => ["runs", id, "events"] as const,
};

export function isActiveRunStatus(status: RunStatus): boolean {
	return status === "queued" || status === "running";
}

// Agent endpoints are scoped to the caller's own SSO id.
function agentsPath(): string {
	return `/agents/${encodeURIComponent(getCurrentUser().user_sso)}`;
}

// Agents

export function agentsQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.agents,
		queryFn: () =>
			api.list(
				`${agentsPath()}?page=1&page_size=${LIST_PAGE_SIZE}`,
				agentSchema,
			),
	});
}

export function useAgents() {
	return useQuery(agentsQueryOptions());
}

export function agentQueryOptions(id: string) {
	return queryOptions({
		queryKey: queryKeys.agent(id),
		queryFn: () => api.get(`${agentsPath()}/${id}`, agentSchema),
	});
}

export function useAgent(id: string) {
	return useQuery(agentQueryOptions(id));
}

export function useCreateAgent() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: AgentInput) =>
			api.post(agentsPath(), agentSchema, input),
		onSuccess: (agent: Agent) => {
			queryClient.setQueryData(queryKeys.agent(agent.id), agent);
			void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
		},
	});
}

// Runs

export function agentRunsQueryOptions(agentId: string) {
	return queryOptions({
		queryKey: queryKeys.agentRuns(agentId),
		queryFn: () =>
			api
				.list(
					`${agentsPath()}/${agentId}/runs?page=1&page_size=${LIST_PAGE_SIZE}`,
					runSchema,
				)
				.then((r) => r.items),
	});
}

export function useAgentRuns(agentId: string) {
	return useQuery(agentRunsQueryOptions(agentId));
}

export function useStartRun(agentId?: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (explicitId?: string) => {
			const id = explicitId ?? agentId;
			if (!id) {
				throw new ApiError(400, "invalid_request", "Agent id is required");
			}
			return api.post(`${agentsPath()}/${id}/runs`, runSchema);
		},
		onSuccess: (run: Run) => {
			queryClient.setQueryData(queryKeys.run(run.id), run);
			void queryClient.invalidateQueries({
				queryKey: queryKeys.agent(run.agent_id),
			});
			void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
			void queryClient.invalidateQueries({
				queryKey: queryKeys.agentRuns(run.agent_id),
			});
		},
	});
}

export function runQueryOptions(
	runId: string,
	{ pollIntervalMs = ACTIVE_RUN_POLL_MS }: PollOptions = {},
) {
	return queryOptions({
		queryKey: queryKeys.run(runId),
		queryFn: () => api.get(`/runs/${runId}`, runSchema),
		refetchInterval: (query) => {
			const status = query.state.data?.status;
			return status && isActiveRunStatus(status) ? pollIntervalMs : false;
		},
	});
}

export function useRun(runId: string, options?: PollOptions) {
	return useQuery(runQueryOptions(runId, options));
}

export function useRunEvents(
	runId: string,
	{ pollIntervalMs = ACTIVE_RUN_POLL_MS }: PollOptions = {},
) {
	const queryClient = useQueryClient();
	return useQuery({
		queryKey: queryKeys.runEvents(runId),
		queryFn: () =>
			api.list(`/runs/${runId}/events`, runEventSchema).then((r) => r.items),
		// Keep polling events only while the run itself is still active.
		refetchInterval: () => {
			const run = queryClient.getQueryData<Run>(queryKeys.run(runId));
			return run && isActiveRunStatus(run.status) ? pollIntervalMs : false;
		},
	});
}
