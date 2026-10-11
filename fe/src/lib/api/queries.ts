import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { ApiError, api, DEV_USER_HEADER } from "./client";
import {
	type Agent,
	type AgentInput,
	agentSchema,
	findingSchema,
	type Run,
	type RunStatus,
	runEventSchema,
	runSchema,
	type SignInInput,
	signInInputSchema,
} from "./schemas";
import {
	clearSessionUser,
	getSessionUser,
	setSessionUser,
	type User,
} from "./session";

export type FindingsFilter = { agent_id?: string; run_id?: string };
export type PollOptions = { pollIntervalMs?: number };

export const ACTIVE_RUN_POLL_MS = 1500;

// Lists request one bounded page: the backend caps page_size at 100.
const LIST_PAGE_SIZE = 100;

export const queryKeys = {
	me: ["me"] as const,
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

function requireUser(): User {
	const user = getSessionUser();
	if (!user) {
		throw new ApiError(401, "unauthorized", "Sign in to continue.");
	}
	return user;
}

function agentsPath(user_sso: string): string {
	return `/agents/${encodeURIComponent(user_sso)}`;
}

// Session

export function useMe() {
	return useQuery({
		queryKey: queryKeys.me,
		queryFn: () => getSessionUser(),
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useSignIn() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: SignInInput): Promise<User> => {
			const { user_sso } = signInInputSchema.parse(input);
			// Verify the identity the way every later request will present it,
			// before storing it.
			await api.list(
				`${agentsPath(user_sso)}?page=1&page_size=1`,
				agentSchema,
				{
					headers: { [DEV_USER_HEADER]: user_sso },
				},
			);
			setSessionUser(user_sso);
			return { user_sso };
		},
		onSuccess: (user) => {
			queryClient.setQueryData(queryKeys.me, user);
		},
	});
}

export function useSignOut() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async () => {
			clearSessionUser();
		},
		onSuccess: () => {
			queryClient.setQueryData(queryKeys.me, null);
			// Drop everything the signed-out identity could see.
			queryClient.removeQueries({
				predicate: (query) => query.queryKey[0] !== "me",
			});
		},
	});
}

// Agents

export function agentsQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.agents,
		queryFn: () => {
			const user = requireUser();
			return api.list(
				`${agentsPath(user.user_sso)}?page=1&page_size=${LIST_PAGE_SIZE}`,
				agentSchema,
			);
		},
	});
}

export function useAgents() {
	return useQuery(agentsQueryOptions());
}

export function agentQueryOptions(id: string) {
	return queryOptions({
		queryKey: queryKeys.agent(id),
		queryFn: () => {
			const user = requireUser();
			return api.get(`${agentsPath(user.user_sso)}/${id}`, agentSchema);
		},
	});
}

export function useAgent(id: string) {
	return useQuery(agentQueryOptions(id));
}

export function useCreateAgent() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: AgentInput) => {
			const user = requireUser();
			return api.post(agentsPath(user.user_sso), agentSchema, input);
		},
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
		queryFn: () => {
			const user = requireUser();
			return api
				.list(
					`${agentsPath(user.user_sso)}/${agentId}/runs?page=1&page_size=${LIST_PAGE_SIZE}`,
					runSchema,
				)
				.then((r) => r.items);
		},
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
			const user = requireUser();
			return api.post(`${agentsPath(user.user_sso)}/${id}/runs`, runSchema);
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
		queryFn: () => {
			requireUser();
			return api.get(`/runs/${runId}`, runSchema);
		},
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
		queryFn: () => {
			requireUser();
			return api
				.list(`/runs/${runId}/events`, runEventSchema)
				.then((r) => r.items);
		},
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
		queryFn: () => {
			requireUser();
			return api
				.list(`/security/findings${query ? `?${query}` : ""}`, findingSchema)
				.then((r) => r.items);
		},
	});
}

export function useFindings(filter: FindingsFilter = {}) {
	return useQuery(findingsQueryOptions(filter));
}
