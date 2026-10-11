import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "#/mocks/server";
import type { HttpAgentSeed } from "#/test/fixtures";
import { rogueAgentInput, safeAgentInput } from "#/test/fixtures";
import { createQueryWrapper } from "#/test/query";
import { signInAs } from "#/test/session";
import { API_BASE_URL, api } from "./client";
import {
	isActiveChainRunStatus,
	isActiveRunStatus,
	useAgent,
	useAgents,
	useChain,
	useChainRun,
	useChains,
	useCreateAgent,
	useCreateChain,
	useCreateConnector,
	useCreateWebhook,
	useMe,
	useRun,
	useSignIn,
	useSignOut,
	useStartChainRun,
	useStartRun,
	useWebhooks,
	webhookFireUrl,
} from "./queries";
import {
	type AgentInput,
	agentSchema,
	connectorCreateFromHttpCall,
	type RunStatus,
} from "./schemas";
import { getSessionUser } from "./session";

type Wrapper = ReturnType<typeof createQueryWrapper>;

async function signIn(wrapper: Wrapper, user_sso = "angel") {
	const { result } = renderHook(() => useSignIn(), { wrapper });
	return act(() => result.current.mutateAsync({ user_sso }));
}

async function createAgent(wrapper: Wrapper, seed: HttpAgentSeed) {
	const connectors = renderHook(() => useCreateConnector(), { wrapper });
	const primitives: AgentInput["configurations"]["primitives"] = {};
	for (const [name, contract] of Object.entries(
		seed.configurations.primitives,
	)) {
		const connector = await act(() =>
			connectors.result.current.mutateAsync(
				connectorCreateFromHttpCall(name, contract),
			),
		);
		primitives[connector.id] = {};
	}
	const { result } = renderHook(() => useCreateAgent(), { wrapper });
	return act(() =>
		result.current.mutateAsync({
			agentTitle: seed.agentTitle,
			systemPrompt: seed.systemPrompt,
			configurations: {
				primitives,
				...(seed.configurations.month != null
					? { month: seed.configurations.month }
					: {}),
				dayOfWeek: seed.configurations.dayOfWeek,
				timeOfDay: seed.configurations.timeOfDay,
			},
		}),
	);
}

async function startRun(wrapper: Wrapper, agentId: string) {
	const { result } = renderHook(() => useStartRun(agentId), { wrapper });
	return act(() => result.current.mutateAsync());
}

describe("isActiveRunStatus", () => {
	it("is true only while a run is queued or running", () => {
		expect(isActiveRunStatus("queued")).toBe(true);
		expect(isActiveRunStatus("running")).toBe(true);
		expect(isActiveRunStatus("succeeded")).toBe(false);
		expect(isActiveRunStatus("failed")).toBe(false);
		expect(isActiveRunStatus("timed_out")).toBe(false);
	});
});

describe("isActiveChainRunStatus", () => {
	it("is true only while a chain run is running", () => {
		expect(isActiveChainRunStatus("running")).toBe(true);
		expect(isActiveChainRunStatus("succeeded")).toBe(false);
		expect(isActiveChainRunStatus("failed")).toBe(false);
	});
});

describe("session hooks", () => {
	it("useMe resolves to null without a session", async () => {
		const { result } = renderHook(() => useMe(), {
			wrapper: createQueryWrapper(),
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toBeNull();
	});

	it("useSignIn verifies the identity against the API, stores it, and useMe sees it", async () => {
		const wrapper = createQueryWrapper();
		const user = await signIn(wrapper, "angel");
		expect(user).toEqual({ user_sso: "angel" });
		expect(getSessionUser()).toEqual({ user_sso: "angel" });

		const me = renderHook(() => useMe(), { wrapper });
		await waitFor(() => expect(me.result.current.data?.user_sso).toBe("angel"));
	});

	it("useSignIn surfaces an API failure and stores nothing", async () => {
		server.use(
			http.get(`${API_BASE_URL}/agents/:sso`, () => HttpResponse.error()),
		);
		const { result } = renderHook(() => useSignIn(), {
			wrapper: createQueryWrapper(),
		});
		await act(async () => {
			await result.current
				.mutateAsync({ user_sso: "angel" })
				.catch(() => undefined);
		});
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toMatchObject({ code: "network_error" });
		expect(getSessionUser()).toBeNull();
	});

	it("useSignOut clears the session", async () => {
		const wrapper = createQueryWrapper();
		await signIn(wrapper);
		const me = renderHook(() => useMe(), { wrapper });
		await waitFor(() => expect(me.result.current.data?.user_sso).toBe("angel"));

		const signOut = renderHook(() => useSignOut(), { wrapper });
		await act(() => signOut.result.current.mutateAsync());
		await waitFor(() => expect(me.result.current.data).toBeNull());
		expect(getSessionUser()).toBeNull();
	});
});

describe("agent hooks", () => {
	it("useAgents errors with 401 when not signed in", async () => {
		const { result } = renderHook(() => useAgents(), {
			wrapper: createQueryWrapper(),
		});
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toMatchObject({
			status: 401,
			code: "unauthorized",
		});
	});

	it("starts empty, then shows a created agent in the list and by id", async () => {
		const wrapper = createQueryWrapper();
		await signIn(wrapper);

		const list = renderHook(() => useAgents(), { wrapper });
		await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
		expect(list.result.current.data?.items).toEqual([]);
		expect(list.result.current.data?.pagination?.total_items).toBe(0);

		const created = await createAgent(wrapper, safeAgentInput);
		expect(created).toMatchObject({
			title: "Uptime checker",
			system_prompt: "Check the status page and summarise it.",
			owner_user_sso: "angel",
			flagged: false,
			last_run: null,
		});
		const connectorIds = Object.keys(created.configurations.primitives);
		expect(connectorIds).toHaveLength(1);
		expect(created.configurations.primitives[connectorIds[0] ?? ""]).toEqual(
			{},
		);

		await waitFor(() =>
			expect(list.result.current.data?.items).toHaveLength(1),
		);

		const byId = renderHook(() => useAgent(created.id), { wrapper });
		await waitFor(() => expect(byId.result.current.data?.id).toBe(created.id));
	});

	it("masks credentials on the created connector, like the backend does", async () => {
		const wrapper = createQueryWrapper();
		await signIn(wrapper);
		const create = renderHook(() => useCreateConnector(), { wrapper });
		const connector = await act(() =>
			create.result.current.mutateAsync(
				connectorCreateFromHttpCall("status", {
					...safeAgentInput.configurations.primitives.status,
					xApiKey: "key-live-123",
					authorizationHeader: "Bearer tok-456",
				}),
			),
		);
		const stored = connector.contract as {
			credentials?: { xApiKey?: string; authorizationHeader?: string };
		};
		expect(stored.credentials?.xApiKey).toBe("********");
		expect(stored.credentials?.authorizationHeader).toBe("********");
		expect(JSON.stringify(connector)).not.toContain("key-live-123");
	});

	it("rejects an unsafe connector URL with the backend's error shape", async () => {
		const wrapper = createQueryWrapper();
		await signIn(wrapper);
		const { result } = renderHook(() => useCreateConnector(), { wrapper });
		await act(async () => {
			await result.current
				.mutateAsync({
					type: "http",
					contractVersion: 1,
					name: "scrape",
					config: {
						method: "GET",
						URL: "http://169.254.169.254/latest/meta-data/",
					},
				})
				.catch(() => undefined);
		});
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toMatchObject({
			status: 422,
			code: "invalid_connector",
			fields: {
				"config.URL":
					"Private, loopback and link-local addresses are not allowed",
			},
		});
	});

	it("keeps agents private to their owner", async () => {
		const first = createQueryWrapper();
		await signIn(first, "first");
		await createAgent(first, safeAgentInput);

		const second = createQueryWrapper();
		await signIn(second, "second");
		const list = renderHook(() => useAgents(), { wrapper: second });
		await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
		expect(list.result.current.data?.items).toEqual([]);
	});

	it("refuses to read another owner's agents, like the backend does", async () => {
		signInAs("first");
		const error = await api
			.list("/agents/second", agentSchema)
			.catch((e: unknown) => e);
		expect(error).toMatchObject({ status: 403, code: "forbidden" });
	});
});

describe("run hooks", () => {
	it("starts a run queued and polls it through running to succeeded", async () => {
		const wrapper = createQueryWrapper();
		await signIn(wrapper);
		const agent = await createAgent(wrapper, safeAgentInput);

		const run = await startRun(wrapper, agent.id);
		expect(run.status).toBe("queued");

		const seen: RunStatus[] = [];
		const poll = renderHook(
			() => {
				const query = useRun(run.id, { pollIntervalMs: 5 });
				const status = query.data?.status;
				if (status && seen[seen.length - 1] !== status) seen.push(status);
				return query;
			},
			{ wrapper },
		);
		await waitFor(
			() => expect(poll.result.current.data?.status).toBe("succeeded"),
			{ timeout: 4000 },
		);
		expect(seen).toEqual(["queued", "running", "succeeded"]);
		expect(poll.result.current.data?.result?.output).toBeTruthy();

		const detail = renderHook(() => useAgent(agent.id), { wrapper });
		await waitFor(() =>
			expect(detail.result.current.data?.last_run?.status).toBe("succeeded"),
		);
	});

	it("kills a run that posts to an untrusted destination and records a finding", async () => {
		const wrapper = createQueryWrapper();
		await signIn(wrapper);
		const agent = await createAgent(wrapper, rogueAgentInput);
		const run = await startRun(wrapper, agent.id);

		const poll = renderHook(() => useRun(run.id, { pollIntervalMs: 5 }), {
			wrapper,
		});
		await waitFor(
			() => expect(poll.result.current.data?.status).toBe("failed"),
			{ timeout: 4000 },
		);
		expect(poll.result.current.data?.error_message).toMatch(
			/untrusted destination/i,
		);

		const detail = renderHook(() => useAgent(agent.id), { wrapper });
		await waitFor(() => expect(detail.result.current.data?.flagged).toBe(true));
	});

	it("starts a run with optional input", async () => {
		const wrapper = createQueryWrapper();
		await signIn(wrapper);
		const agent = await createAgent(wrapper, safeAgentInput);
		const { result } = renderHook(() => useStartRun(agent.id), { wrapper });
		const run = await act(() =>
			result.current.mutateAsync({ input: "  ticket INC-1  " }),
		);
		expect(run.input).toBe("ticket INC-1");
	});
});

describe("webhook hooks", () => {
	it("creates a webhook, lists it masked, and builds the public fire URL", async () => {
		const wrapper = createQueryWrapper();
		await signIn(wrapper);
		const agent = await createAgent(wrapper, safeAgentInput);

		const created = renderHook(() => useCreateWebhook(), { wrapper });
		const webhook = await act(() =>
			created.result.current.mutateAsync({ target_agent_id: agent.id }),
		);
		expect(webhook.secret).toMatch(/^whsec_/);
		expect(webhookFireUrl(webhook.id)).toBe(
			`${API_BASE_URL}/hooks/${webhook.id}`,
		);

		const list = renderHook(() => useWebhooks(), { wrapper });
		await waitFor(() =>
			expect(list.result.current.data?.items).toHaveLength(1),
		);
		expect(list.result.current.data?.items[0]?.secret).toBe("********");
	});
});

describe("chain hooks", () => {
	it("creates a chain and polls a run through to the final result", async () => {
		const wrapper = createQueryWrapper();
		await signIn(wrapper);
		const first = await createAgent(wrapper, safeAgentInput);
		const second = await createAgent(wrapper, {
			...safeAgentInput,
			agentTitle: "Summarizer",
			configurations: {
				...safeAgentInput.configurations,
				primitives: {
					summarize: safeAgentInput.configurations.primitives.status,
				},
			},
		});

		const create = renderHook(() => useCreateChain(), { wrapper });
		const chain = await act(() =>
			create.result.current.mutateAsync({
				title: "Check then summarize",
				steps: [
					{ agent_id: first.id, label: "Check" },
					{ agent_id: second.id, label: "Summarize" },
				],
			}),
		);

		const list = renderHook(() => useChains(), { wrapper });
		await waitFor(() =>
			expect(list.result.current.data?.items).toHaveLength(1),
		);
		const byId = renderHook(() => useChain(chain.id), { wrapper });
		await waitFor(() => expect(byId.result.current.data?.id).toBe(chain.id));

		const start = renderHook(() => useStartChainRun(chain.id), { wrapper });
		const run = await act(() =>
			start.result.current.mutateAsync({ input: "INC-9" }),
		);
		expect(run.status).toBe("running");
		expect(run.input).toBe("INC-9");

		const poll = renderHook(() => useChainRun(run.id, { pollIntervalMs: 5 }), {
			wrapper,
		});
		await waitFor(
			() => expect(poll.result.current.data?.status).toBe("succeeded"),
			{ timeout: 8000 },
		);
		expect(poll.result.current.data?.final_result?.output).toMatch(
			/all checks passed/i,
		);
	});
});
