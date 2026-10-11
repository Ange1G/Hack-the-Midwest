import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "#/mocks/server";
import { rogueAgentInput, safeAgentInput } from "#/test/fixtures";
import { createQueryWrapper } from "#/test/query";
import { signInAs } from "#/test/session";
import { API_BASE_URL, api } from "./client";
import {
	isActiveRunStatus,
	useAgent,
	useAgents,
	useCreateAgent,
	useFindings,
	useMe,
	useRun,
	useRunEvents,
	useSignIn,
	useSignOut,
	useStartRun,
} from "./queries";
import { type AgentInput, agentSchema, type RunStatus } from "./schemas";
import { getSessionUser } from "./session";

type Wrapper = ReturnType<typeof createQueryWrapper>;

async function signIn(wrapper: Wrapper, user_sso = "angel") {
	const { result } = renderHook(() => useSignIn(), { wrapper });
	return act(() => result.current.mutateAsync({ user_sso }));
}

async function createAgent(wrapper: Wrapper, input: AgentInput) {
	const { result } = renderHook(() => useCreateAgent(), { wrapper });
	return act(() => result.current.mutateAsync(input));
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
		expect(isActiveRunStatus("killed")).toBe(false);
		expect(isActiveRunStatus("cancelled")).toBe(false);
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
		expect(created.configurations.primitives.status).toEqual(
			safeAgentInput.configurations.primitives.status,
		);

		await waitFor(() =>
			expect(list.result.current.data?.items).toHaveLength(1),
		);

		const byId = renderHook(() => useAgent(created.id), { wrapper });
		await waitFor(() => expect(byId.result.current.data?.id).toBe(created.id));
	});

	it("masks credentials in the created agent, like the backend does", async () => {
		const wrapper = createQueryWrapper();
		await signIn(wrapper);
		const created = await createAgent(wrapper, {
			...safeAgentInput,
			configurations: {
				...safeAgentInput.configurations,
				primitives: {
					status: {
						...safeAgentInput.configurations.primitives.status,
						xApiKey: "key-live-123",
						authorizationHeader: "Bearer tok-456",
					},
				},
			},
		});
		const contract = created.configurations.primitives.status;
		expect(contract?.xApiKey).toBe("********");
		expect(contract?.authorizationHeader).toBe("********");
		expect(JSON.stringify(created)).not.toContain("key-live-123");
	});

	it("rejects an unsafe URL with the backend's error shape", async () => {
		const wrapper = createQueryWrapper();
		await signIn(wrapper);
		const { result } = renderHook(() => useCreateAgent(), { wrapper });
		await act(async () => {
			await result.current
				.mutateAsync({
					...safeAgentInput,
					configurations: {
						...safeAgentInput.configurations,
						primitives: {
							scrape: {
								contractVersion: 1,
								method: "GET",
								URL: "http://169.254.169.254/latest/meta-data/",
							},
						},
					},
				})
				.catch(() => undefined);
		});
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toMatchObject({
			status: 422,
			code: "invalid_configuration",
			fields: {
				"configurations.primitives.scrape.URL":
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
		expect(poll.result.current.data?.output).toBeTruthy();

		const events = renderHook(
			() => useRunEvents(run.id, { pollIntervalMs: 5 }),
			{ wrapper },
		);
		await waitFor(() =>
			expect(events.result.current.data?.length).toBeGreaterThan(1),
		);
		const types = events.result.current.data?.map((event) => event.type);
		expect(types).toEqual(expect.arrayContaining(["tool_call", "tool_result"]));

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
			() => expect(poll.result.current.data?.status).toBe("killed"),
			{ timeout: 4000 },
		);
		expect(poll.result.current.data?.finding_id).toBeTruthy();

		const findings = renderHook(() => useFindings({ run_id: run.id }), {
			wrapper,
		});
		await waitFor(() => expect(findings.result.current.data).toHaveLength(1));
		expect(findings.result.current.data?.[0]).toMatchObject({
			action: "killed",
			severity: "critical",
			rule: "exfiltration.untrusted_destination",
			agent_id: agent.id,
		});

		const detail = renderHook(() => useAgent(agent.id), { wrapper });
		await waitFor(() => expect(detail.result.current.data?.flagged).toBe(true));
	});
});
