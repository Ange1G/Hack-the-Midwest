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
	type Connector,
	type ConnectorCreate,
	connectorCreateFromHttpCall,
	connectorSchema,
	executionSchema,
	type Pagination,
	type Run,
	type RunStatus,
} from "./schemas";

export type PollOptions = { pollIntervalMs?: number };

export const ACTIVE_RUN_POLL_MS = 1500;

// Lists request one bounded page: the backend caps page_size at 100.
const LIST_PAGE_SIZE = 100;

export const queryKeys = {
	agents: ["agents"] as const,
	agent: (id: string) => ["agents", id] as const,
	connectors: ["connectors"] as const,
	executions: ["executions"] as const,
	agentRuns: (id: string) => ["agents", id, "runs"] as const,
	run: (id: string) => ["runs", id] as const,
};

export function isActiveRunStatus(status: RunStatus): boolean {
	return status === "queued" || status === "running";
}

// Every endpoint is scoped to the caller's own SSO id.
function agentsPath(): string {
	return `/agents/${encodeURIComponent(getCurrentUser().user_sso)}`;
}

function connectorsPath(): string {
	return `/connectors/${encodeURIComponent(getCurrentUser().user_sso)}`;
}

function executionsPath(): string {
	return `${agentsPath()}/executions`;
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

// The backend stores each HTTP call as a connector; the agent references the
// connectors by id.
async function createConnectorsForAgent(
	input: AgentInput,
): Promise<Record<string, Record<string, never>>> {
	const primitives: Record<string, Record<string, never>> = {};
	for (const [name, contract] of Object.entries(
		input.configurations.primitives,
	)) {
		const body = connectorCreateFromHttpCall(name, contract);
		const connector = await createConnectorWithUniqueName(body);
		primitives[connector.id] = {};
	}
	return primitives;
}

async function createConnectorWithUniqueName(
	body: ConnectorCreate,
): Promise<Connector> {
	try {
		return await api.post(connectorsPath(), connectorSchema, body);
	} catch (error) {
		if (error instanceof ApiError && error.status === 409) {
			const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
			return api.post(connectorsPath(), connectorSchema, {
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
			const primitives = await createConnectorsForAgent(input);
			return api.post(agentsPath(), agentSchema, {
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
		queryFn: () =>
			api
				.list(
					`${connectorsPath()}?page=1&page_size=${LIST_PAGE_SIZE}`,
					connectorSchema,
				)
				.then((r) => r.items),
	});
}

export function useConnectors() {
	return useQuery(connectorsQueryOptions());
}

export function useCreateConnector() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: ConnectorCreate) =>
			api.post(connectorsPath(), connectorSchema, body),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.connectors });
		},
	});
}

// Executions

export function executionsQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.executions,
		queryFn: () =>
			api
				.list(
					`${executionsPath()}?page=1&page_size=${LIST_PAGE_SIZE}`,
					executionSchema,
				)
				.then((r) => r.items),
	});
}

export function useExecutions() {
	return useQuery(executionsQueryOptions());
}

export function agentRunsQueryOptions(agentId: string) {
	return queryOptions({
		queryKey: queryKeys.agentRuns(agentId),
		queryFn: async () => {
			const { items } = await api.list(
				`${executionsPath()}?page=1&page_size=${LIST_PAGE_SIZE}`,
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
			return api.post(`${agentsPath()}/${id}/executions`, executionSchema);
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
		queryFn: () => api.get(`${executionsPath()}/${runId}`, executionSchema),
		refetchInterval: (query) => {
			const status = query.state.data?.status;
			return status && isActiveRunStatus(status) ? pollIntervalMs : false;
		},
	});
}

export function useRun(runId: string, options?: PollOptions) {
	return useQuery(runQueryOptions(runId, options));
}
