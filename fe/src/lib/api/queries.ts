import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { ApiError, api } from "./client";
import {
	type Agent,
	type AgentInput,
	agentSchema,
	type Credentials,
	collection,
	findingSchema,
	type Run,
	type RunStatus,
	runEventSchema,
	runSchema,
	toolDefinitionSchema,
	type User,
	userSchema,
} from "./schemas";

export type FindingsFilter = { agent_id?: string; run_id?: string };
export type PollOptions = { pollIntervalMs?: number };

export const ACTIVE_RUN_POLL_MS = 1500;

export const queryKeys = {
	me: ["me"] as const,
	tools: ["tools"] as const,
	agents: ["agents"] as const,
	agent: (id: string) => ["agents", id] as const,
	agentRuns: (id: string) => ["agents", id, "runs"] as const,
	run: (id: string) => ["runs", id] as const,
	runEvents: (id: string) => ["runs", id, "events"] as const,
	findings: (filter: FindingsFilter) => ["findings", filter] as const,
};

export function isActiveRunStatus(status: RunStatus): boolean {
	return status === "queued" || status === "running";
}

// Session

export function meQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.me,
		queryFn: async (): Promise<User | null> => {
			try {
				return await api.get("/auth/me", userSchema);
			} catch (error) {
				if (error instanceof ApiError && error.status === 401) return null;
				throw error;
			}
		},
		staleTime: 60_000,
	});
}

export function useMe() {
	return useQuery(meQueryOptions());
}

export function useLogin() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (credentials: Credentials) =>
			api.post("/auth/login", userSchema, credentials),
		onSuccess: (user) => {
			queryClient.setQueryData(queryKeys.me, user);
		},
	});
}

export function useSignup() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (credentials: Credentials) =>
			api.post("/auth/signup", userSchema, credentials),
		onSuccess: (user) => {
			queryClient.setQueryData(queryKeys.me, user);
		},
	});
}

export function useLogout() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => api.postVoid("/auth/logout"),
		onSuccess: () => {
			queryClient.setQueryData(queryKeys.me, null);
			// Drop everything the signed-out user could see.
			queryClient.removeQueries({
				predicate: (query) => query.queryKey[0] !== "me",
			});
		},
	});
}

// Tools

export function toolsQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.tools,
		queryFn: () =>
			api
				.get("/tools", collection(toolDefinitionSchema))
				.then((result) => result.items),
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useToolDefinitions() {
	return useQuery(toolsQueryOptions());
}

// Agents

export function agentsQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.agents,
		queryFn: () =>
			api
				.get("/agents", collection(agentSchema))
				.then((result) => result.items),
	});
}

export function useAgents() {
	return useQuery(agentsQueryOptions());
}

export function agentQueryOptions(id: string) {
	return queryOptions({
		queryKey: queryKeys.agent(id),
		queryFn: () => api.get(`/agents/${id}`, agentSchema),
	});
}

export function useAgent(id: string) {
	return useQuery(agentQueryOptions(id));
}

export function useCreateAgent() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: AgentInput) => api.post("/agents", agentSchema, input),
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
				.get(`/agents/${agentId}/runs`, collection(runSchema))
				.then((result) => result.items),
	});
}

export function useAgentRuns(agentId: string) {
	return useQuery(agentRunsQueryOptions(agentId));
}

export function useStartRun(agentId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => api.post(`/agents/${agentId}/runs`, runSchema),
		onSuccess: (run: Run) => {
			queryClient.setQueryData(queryKeys.run(run.id), run);
			void queryClient.invalidateQueries({
				queryKey: queryKeys.agent(agentId),
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
			api
				.get(`/runs/${runId}/events`, collection(runEventSchema))
				.then((result) => result.items),
		// Keep polling events only while the run itself is still active.
		refetchInterval: () => {
			const run = queryClient.getQueryData<Run>(queryKeys.run(runId));
			return run && isActiveRunStatus(run.status) ? pollIntervalMs : false;
		},
	});
}

// Security

export function findingsQueryOptions(filter: FindingsFilter = {}) {
	const params = new URLSearchParams();
	if (filter.agent_id) params.set("agent_id", filter.agent_id);
	if (filter.run_id) params.set("run_id", filter.run_id);
	const query = params.toString();
	return queryOptions({
		queryKey: queryKeys.findings(filter),
		queryFn: () =>
			api
				.get(
					`/security/findings${query ? `?${query}` : ""}`,
					collection(findingSchema),
				)
				.then((result) => result.items),
	});
}

export function useFindings(filter: FindingsFilter = {}) {
	return useQuery(findingsQueryOptions(filter));
}
