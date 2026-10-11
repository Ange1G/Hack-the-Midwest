import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import { resetWatchedRuns, watchRun } from "#/lib/run-watch";
import { API_BASE_URL, ApiError, api, DEV_USER_HEADER } from "./client";
import {
	type Agent,
	type AgentInput,
	type AgentUpdate,
	agentSchema,
	agentTemplateSchema,
	type Chain,
	type ChainCreate,
	type ChainRun,
	type ChainRunStatus,
	type Connector,
	type ConnectorCreate,
	type ConnectorTools,
	chainRunSchema,
	chainRunStepSchema,
	chainSchema,
	connectorSchema,
	connectorToolsSchema,
	connectorTypeCatalogSchema,
	type ExecutionCreate,
	executionCreateSchema,
	executionSchema,
	type Finding,
	type IntegrationInstall,
	integrationSchema,
	type KnowledgeDocumentCreate,
	knowledgeDocumentSchema,
	memoryEntrySchema,
	type Pagination,
	type Run,
	type RunStatus,
	type SignInInput,
	signInInputSchema,
	type Webhook,
	type WebhookCreate,
	webhookSchema,
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
	connectorTools: (id: string) => ["connectors", id, "tools"] as const,
	connectorTypes: ["connector-types"] as const,
	executions: ["executions"] as const,
	agentRuns: (id: string) => ["agents", id, "runs"] as const,
	run: (id: string) => ["runs", id] as const,
	findings: (filter: FindingsFilter) => ["findings", filter] as const,
	webhooks: ["webhooks"] as const,
	chains: ["chains"] as const,
	chain: (id: string) => ["chains", id] as const,
	chainRuns: (chainId: string) => ["chains", chainId, "runs"] as const,
	chainRun: (id: string) => ["chain-runs", id] as const,
	chainRunSteps: (runId: string) => ["chain-runs", runId, "steps"] as const,
	integrations: ["integrations"] as const,
	agentTemplates: ["agent-templates"] as const,
	knowledgeDocuments: (connectorId: string) =>
		["connectors", connectorId, "documents"] as const,
	agentMemory: (agentId: string) => ["agents", agentId, "memory"] as const,
};

export function isActiveRunStatus(status: RunStatus): boolean {
	return status === "queued" || status === "running";
}

export function isActiveChainRunStatus(status: ChainRunStatus): boolean {
	return status === "running";
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

function webhooksPath(user_sso: string): string {
	return `/webhooks/${encodeURIComponent(user_sso)}`;
}

function chainsPath(user_sso: string): string {
	return `/chains/${encodeURIComponent(user_sso)}`;
}

export function webhookFireUrl(webhookId: string): string {
	return `${API_BASE_URL}/hooks/${encodeURIComponent(webhookId)}`;
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
			resetWatchedRuns();
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

export function useCreateAgent() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: AgentInput) => {
			const user = requireUser();
			return api.post(agentsPath(user.user_sso), agentSchema, input);
		},
		onSuccess: (agent: Agent) => {
			queryClient.setQueryData(queryKeys.agent(agent.id), agent);
			void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
		},
	});
}

export function useUpdateAgent() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			...body
		}: AgentUpdate & { id: string }): Promise<Agent> => {
			const user = requireUser();
			return api.patch(`${agentsPath(user.user_sso)}/${id}`, agentSchema, body);
		},
		onSuccess: (agent: Agent) => {
			queryClient.setQueryData(queryKeys.agent(agent.id), agent);
			void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
		},
	});
}

export function useDeleteAgent() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (agentId: string) => {
			const user = requireUser();
			return api.delete(`${agentsPath(user.user_sso)}/${agentId}`);
		},
		onSuccess: (_data, agentId) => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
			queryClient.removeQueries({ queryKey: queryKeys.agent(agentId) });
			queryClient.removeQueries({ queryKey: queryKeys.agentMemory(agentId) });
		},
	});
}

// Agent memory

export function useAgentMemory(agentId: string, enabled = true) {
	return useQuery({
		queryKey: queryKeys.agentMemory(agentId),
		enabled,
		queryFn: () => {
			const user = requireUser();
			return api.get(
				`${agentsPath(user.user_sso)}/${agentId}/memory`,
				z.array(memoryEntrySchema),
			);
		},
	});
}

export function useDeleteMemory(agentId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		// No key clears every entry.
		mutationFn: (key?: string) => {
			const user = requireUser();
			const base = `${agentsPath(user.user_sso)}/${agentId}/memory`;
			return api.delete(key ? `${base}/${encodeURIComponent(key)}` : base);
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.agentMemory(agentId),
			});
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

export function useConnectorTools(connectorId: string | undefined) {
	return useQuery({
		queryKey: queryKeys.connectorTools(connectorId ?? ""),
		enabled: Boolean(connectorId),
		queryFn: (): Promise<ConnectorTools> => {
			const user = requireUser();
			return api.get(
				`${connectorsPath(user.user_sso)}/${connectorId}/tools`,
				connectorToolsSchema,
			);
		},
	});
}

export async function createConnectorRecord(
	body: ConnectorCreate,
): Promise<Connector> {
	const user = requireUser();
	try {
		return await api.post(connectorsPath(user.user_sso), connectorSchema, body);
	} catch (error) {
		if (error instanceof ApiError && error.status === 409) {
			const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
			return api.post(connectorsPath(user.user_sso), connectorSchema, {
				...body,
				name: `${body.name}_${suffix}`.slice(0, 64),
			});
		}
		throw error;
	}
}

export function useCreateConnector() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: ConnectorCreate) => createConnectorRecord(body),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.connectors });
		},
	});
}

export function useDeleteConnector() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (connectorId: string) => {
			const user = requireUser();
			return api.delete(`${connectorsPath(user.user_sso)}/${connectorId}`);
		},
		onSuccess: (_data, connectorId) => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.connectors });
			queryClient.removeQueries({
				queryKey: queryKeys.connectorTools(connectorId),
			});
		},
	});
}

export function connectorTypesQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.connectorTypes,
		queryFn: () =>
			api.get("/connector-types", z.array(connectorTypeCatalogSchema)),
	});
}

export function useConnectorTypes() {
	return useQuery(connectorTypesQueryOptions());
}

// Integration catalog and agent templates

export function integrationsQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.integrations,
		queryFn: () => api.get("/integrations", z.array(integrationSchema)),
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useIntegrations() {
	return useQuery(integrationsQueryOptions());
}

export function useInstallIntegration() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			integrationId,
			...body
		}: IntegrationInstall & { integrationId: string }): Promise<Connector> => {
			const user = requireUser();
			const path = `/integrations/${encodeURIComponent(user.user_sso)}/${encodeURIComponent(integrationId)}/install`;
			const payload = body.apiKey ? { apiKey: body.apiKey } : {};
			try {
				return await api.post(path, connectorSchema, {
					...payload,
					...(body.name ? { name: body.name } : {}),
				});
			} catch (error) {
				// Installed before under the default name: keep both connectors.
				if (error instanceof ApiError && error.status === 409 && !body.name) {
					const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 6);
					return api.post(path, connectorSchema, {
						...payload,
						name: `${integrationId}_${suffix}`,
					});
				}
				throw error;
			}
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.connectors });
		},
	});
}

export function agentTemplatesQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.agentTemplates,
		queryFn: () => api.get("/agent-templates", z.array(agentTemplateSchema)),
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useAgentTemplates() {
	return useQuery(agentTemplatesQueryOptions());
}

// Knowledge documents

export function useKnowledgeDocuments(connectorId: string) {
	return useQuery({
		queryKey: queryKeys.knowledgeDocuments(connectorId),
		queryFn: () => {
			const user = requireUser();
			return api.get(
				`${connectorsPath(user.user_sso)}/${connectorId}/documents`,
				z.array(knowledgeDocumentSchema),
			);
		},
	});
}

export function useAddKnowledgeDocument(connectorId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: KnowledgeDocumentCreate) => {
			const user = requireUser();
			return api.post(
				`${connectorsPath(user.user_sso)}/${connectorId}/documents`,
				knowledgeDocumentSchema,
				body,
			);
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.knowledgeDocuments(connectorId),
			});
		},
	});
}

export function useDeleteKnowledgeDocument(connectorId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (documentId: string) => {
			const user = requireUser();
			return api.delete(
				`${connectorsPath(user.user_sso)}/${connectorId}/documents/${documentId}`,
			);
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.knowledgeDocuments(connectorId),
			});
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

export type StartRunVariables = string | { agentId?: string; input?: string };

function resolveStartRun(
	hookAgentId: string | undefined,
	variables: StartRunVariables | undefined,
): { agentId: string; body: ExecutionCreate | undefined } {
	if (typeof variables === "string") {
		return { agentId: variables, body: undefined };
	}
	const id = variables?.agentId ?? hookAgentId;
	if (!id) {
		throw new ApiError(400, "invalid_request", "Agent id is required");
	}
	const parsed = executionCreateSchema.parse({ input: variables?.input });
	return { agentId: id, body: parsed.input ? parsed : undefined };
}

export function useStartRun(agentId?: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (variables?: StartRunVariables) => {
			const { agentId: id, body } = resolveStartRun(agentId, variables);
			const user = requireUser();
			return api.post(
				`${agentsPath(user.user_sso)}/${id}/executions`,
				executionSchema,
				body,
			);
		},
		onSuccess: (run: Run) => {
			if (isActiveRunStatus(run.status)) watchRun(run.id);
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

// Webhooks

export function webhooksQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.webhooks,
		queryFn: () => {
			const user = requireUser();
			return api.list(
				`${webhooksPath(user.user_sso)}?page=1&page_size=${LIST_PAGE_SIZE}`,
				webhookSchema,
			);
		},
	});
}

export function useWebhooks() {
	return useQuery(webhooksQueryOptions());
}

export function useCreateWebhook() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: WebhookCreate) => {
			const user = requireUser();
			return api.post(webhooksPath(user.user_sso), webhookSchema, body);
		},
		onSuccess: (webhook: Webhook) => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks });
			return webhook;
		},
	});
}

export function useDeleteWebhook() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (webhookId: string) => {
			const user = requireUser();
			return api.delete(`${webhooksPath(user.user_sso)}/${webhookId}`);
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks });
		},
	});
}

// Chains

export function chainsQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.chains,
		queryFn: () => {
			const user = requireUser();
			return api.list(
				`${chainsPath(user.user_sso)}?page=1&page_size=${LIST_PAGE_SIZE}`,
				chainSchema,
			);
		},
	});
}

export function useChains() {
	return useQuery(chainsQueryOptions());
}

export function chainQueryOptions(id: string) {
	return queryOptions({
		queryKey: queryKeys.chain(id),
		queryFn: () => {
			const user = requireUser();
			return api.get(`${chainsPath(user.user_sso)}/${id}`, chainSchema);
		},
	});
}

export function useChain(id: string) {
	return useQuery(chainQueryOptions(id));
}

export function useCreateChain() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: ChainCreate) => {
			const user = requireUser();
			return api.post(chainsPath(user.user_sso), chainSchema, body);
		},
		onSuccess: (chain: Chain) => {
			queryClient.setQueryData(queryKeys.chain(chain.id), chain);
			void queryClient.invalidateQueries({ queryKey: queryKeys.chains });
		},
	});
}

export function useDeleteChain() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (chainId: string) => {
			const user = requireUser();
			return api.delete(`${chainsPath(user.user_sso)}/${chainId}`);
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.chains });
		},
	});
}

export function useStartChainRun(chainId?: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (variables?: { chainId?: string; input?: string }) => {
			const id = variables?.chainId ?? chainId;
			if (!id) {
				throw new ApiError(400, "invalid_request", "Chain id is required");
			}
			const user = requireUser();
			const parsed = executionCreateSchema.parse({ input: variables?.input });
			return api.post(
				`${chainsPath(user.user_sso)}/${id}/runs`,
				chainRunSchema,
				parsed.input ? parsed : undefined,
			);
		},
		onSuccess: (run: ChainRun) => {
			queryClient.setQueryData(queryKeys.chainRun(run.id), run);
			queryClient.setQueryData<ChainRun[]>(
				queryKeys.chainRuns(run.chain_id),
				(current) => [
					run,
					...(current ?? []).filter((item) => item.id !== run.id),
				],
			);
		},
	});
}

export function chainRunQueryOptions(
	runId: string,
	{ pollIntervalMs = ACTIVE_RUN_POLL_MS }: PollOptions = {},
) {
	return queryOptions({
		queryKey: queryKeys.chainRun(runId),
		queryFn: () => {
			const user = requireUser();
			return api.get(
				`${chainsPath(user.user_sso)}/runs/${runId}`,
				chainRunSchema,
			);
		},
		refetchInterval: (query) => {
			const status = query.state.data?.status;
			return status && isActiveChainRunStatus(status) ? pollIntervalMs : false;
		},
	});
}

export function useChainRun(runId: string, options?: PollOptions) {
	return useQuery(chainRunQueryOptions(runId, options));
}

export function chainRunStepsQueryOptions(runId: string) {
	return queryOptions({
		queryKey: queryKeys.chainRunSteps(runId),
		queryFn: () => {
			const user = requireUser();
			return api.get(
				`${chainsPath(user.user_sso)}/runs/${runId}/steps`,
				z.array(chainRunStepSchema),
			);
		},
	});
}

export function useChainRunSteps(runId: string, enabled = true) {
	return useQuery({
		...chainRunStepsQueryOptions(runId),
		enabled,
	});
}
