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
	type Connector,
	type ConnectorCreate,
	connectorCreateFromHttpCall,
	connectorSchema,
	executionSchema,
	type Pagination,
	type Finding,
	type Run,
	type RunStatus,
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
	connectors: ["connectors"] as const,
	executions: ["executions"] as const,
	agentRuns: (id: string) => ["agents", id, "runs"] as const,
	run: (id: string) => ["runs", id] as const,
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

function connectorsPath(user_sso: string): string {
	return `/connectors/${encodeURIComponent(user_sso)}`;
}

function executionsPath(user_sso: string): string {
	return `${agentsPath(user_sso)}/executions`;
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

async function createConnectorsForAgent(
	user_sso: string,
	input: AgentInput,
): Promise<Record<string, Record<string, never>>> {
	const primitives: Record<string, Record<string, never>> = {};
	for (const [name, contract] of Object.entries(
		input.configurations.primitives,
	)) {
		const body = connectorCreateFromHttpCall(name, contract);
		const connector = await createConnectorWithUniqueName(user_sso, body);
		primitives[connector.id] = {};
	}
	return primitives;
}

async function createConnectorWithUniqueName(
	user_sso: string,
	body: ConnectorCreate,
): Promise<Connector> {
	try {
		return await api.post(connectorsPath(user_sso), connectorSchema, body);
	} catch (error) {
		if (error instanceof ApiError && error.status === 409) {
			const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
			return api.post(connectorsPath(user_sso), connectorSchema, {
				...body,
				name: `${body.name}_${suffix}`.slice(0, 64),
			});
		}
		throw error;
	}
}

export function useCreateAgent() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: AgentInput) => {
			const user = requireUser();
			const primitives = await createConnectorsForAgent(user.user_sso, input);
			return api.post(agentsPath(user.user_sso), agentSchema, {
				...input,
				configurations: {
					...input.configurations,
					primitives,
				},
			});
		},
		onSuccess: (agent: Agent) => {
			queryClient.setQueryData(queryKeys.agent(agent.id), agent);
			void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
			void queryClient.invalidateQueries({ queryKey: queryKeys.connectors });
		},
	});
}

// Connectors

export function connectorsQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.connectors,
		queryFn: () => {
			const user = requireUser();
			return api
				.list(
					`${connectorsPath(user.user_sso)}?page=1&page_size=${LIST_PAGE_SIZE}`,
					connectorSchema,
				)
				.then((r) => r.items);
		},
	});
}

export function useConnectors() {
	return useQuery(connectorsQueryOptions());
}

export function useCreateConnector() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: ConnectorCreate) => {
			const user = requireUser();
			return api.post(connectorsPath(user.user_sso), connectorSchema, body);
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.connectors });
		},
	});
}

// Executions

export function executionsQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.executions,
		queryFn: () => {
			const user = requireUser();
			return api
				.list(
					`${executionsPath(user.user_sso)}?page=1&page_size=${LIST_PAGE_SIZE}`,
					executionSchema,
				)
				.then((r) => r.items);
		},
	});
}

export function useExecutions() {
	return useQuery(executionsQueryOptions());
}

export function agentRunsQueryOptions(agentId: string) {
	return queryOptions({
		queryKey: queryKeys.agentRuns(agentId),
		queryFn: async () => {
			const user = requireUser();
			const { items } = await api.list(
				`${executionsPath(user.user_sso)}?page=1&page_size=${LIST_PAGE_SIZE}`,
				executionSchema,
			);
			return items.filter((item) => item.agent_id === agentId);
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
			return api.post(
				`${agentsPath(user.user_sso)}/${id}/executions`,
				executionSchema,
			);
		},
		onSuccess: (run: Run) => {
			queryClient.setQueryData(queryKeys.run(run.id), run);
			queryClient.setQueryData<Run[]>(queryKeys.executions, (current) => {
				const items = current ?? [];
				return [run, ...items.filter((item) => item.id !== run.id)];
			});
			queryClient.setQueryData<Run[]>(
				queryKeys.agentRuns(run.agent_id),
				(current) => {
					const items = current ?? [];
					return [run, ...items.filter((item) => item.id !== run.id)];
				},
			);
			const summary = {
				id: run.id,
				status: run.status,
				created_at: run.created_at,
			};
			queryClient.setQueryData<Agent>(queryKeys.agent(run.agent_id), (agent) =>
				agent ? { ...agent, last_run: summary } : agent,
			);
			queryClient.setQueryData<{
				items: Agent[];
				pagination: Pagination | null;
			}>(queryKeys.agents, (current) => {
				if (!current) return current;
				return {
					...current,
					items: current.items.map((agent) =>
						agent.id === run.agent_id ? { ...agent, last_run: summary } : agent,
					),
				};
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.agent(run.agent_id),
			});
			void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
			void queryClient.invalidateQueries({ queryKey: queryKeys.executions });
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
			const user = requireUser();
			return api.get(
				`${executionsPath(user.user_sso)}/${runId}`,
				executionSchema,
			);
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

// Security findings are not implemented on the backend yet.
export function findingsQueryOptions(filter: FindingsFilter = {}) {
	return queryOptions({
		queryKey: queryKeys.findings(filter),
		queryFn: async (): Promise<Finding[]> => [],
	});
}

export function useFindings(filter: FindingsFilter = {}) {
	return useQuery(findingsQueryOptions(filter));
}
