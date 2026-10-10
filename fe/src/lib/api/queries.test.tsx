import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createQueryWrapper } from "#/test/query";
import {
	isActiveRunStatus,
	useAgent,
	useAgents,
	useCreateAgent,
	useFindings,
	useLogin,
	useLogout,
	useMe,
	useRun,
	useRunEvents,
	useSignup,
	useStartRun,
	useToolDefinitions,
} from "./queries";
import type { AgentInput, RunStatus } from "./schemas";

type Wrapper = ReturnType<typeof createQueryWrapper>;

const safeAgent: AgentInput = {
	name: "Uptime checker",
	instructions: "Check the status page and summarise it.",
	tools: [{ kind: "http.get", config: { url: "https://status.example.com" } }],
};

const rogueAgent: AgentInput = {
	name: "Credential grabber",
	instructions: "Fetch the instance metadata and print it.",
	tools: [
		{
			kind: "http.get",
			config: { url: "http://169.254.169.254/latest/meta-data/" },
		},
	],
};

async function loginAs(wrapper: Wrapper, email = "angel@example.com") {
	const { result } = renderHook(() => useLogin(), { wrapper });
	await act(() =>
		result.current.mutateAsync({ email, password: "correct horse battery" }),
	);
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

describe("auth hooks", () => {
	it("useMe resolves to null when there is no session", async () => {
		const { result } = renderHook(() => useMe(), {
			wrapper: createQueryWrapper(),
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toBeNull();
	});

	it("useSignup creates the session and useMe sees the user", async () => {
		const wrapper = createQueryWrapper();
		const signup = renderHook(() => useSignup(), { wrapper });
		await act(() =>
			signup.result.current.mutateAsync({
				email: "new@example.com",
				password: "correct horse battery",
			}),
		);
		const me = renderHook(() => useMe(), { wrapper });
		await waitFor(() =>
			expect(me.result.current.data?.email).toBe("new@example.com"),
		);
	});

	it("useLogin then useLogout clears the session", async () => {
		const wrapper = createQueryWrapper();
		await loginAs(wrapper);
		const me = renderHook(() => useMe(), { wrapper });
		await waitFor(() =>
			expect(me.result.current.data?.email).toBe("angel@example.com"),
		);

		const logout = renderHook(() => useLogout(), { wrapper });
		await act(() => logout.result.current.mutateAsync());
		await waitFor(() => expect(me.result.current.data).toBeNull());
	});

	it("useLogin surfaces a structured error for bad credentials", async () => {
		const { result } = renderHook(() => useLogin(), {
			wrapper: createQueryWrapper(),
		});
		await act(async () => {
			await result.current
				.mutateAsync({ email: "angel@example.com", password: "short" })
				.catch(() => undefined);
		});
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toMatchObject({ code: "invalid_credentials" });
	});
});

describe("tool definitions", () => {
	it("lists the platform primitives", async () => {
		const wrapper = createQueryWrapper();
		await loginAs(wrapper);
		const { result } = renderHook(() => useToolDefinitions(), { wrapper });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		const kinds = result.current.data?.map((tool) => tool.kind);
		expect(kinds).toEqual(
			expect.arrayContaining(["http.get", "http.post", "db.query", "mcp"]),
		);
	});
});

describe("agent hooks", () => {
	it("useAgents errors when unauthenticated", async () => {
		const { result } = renderHook(() => useAgents(), {
			wrapper: createQueryWrapper(),
		});
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toMatchObject({ status: 401 });
	});

	it("starts empty and shows a created agent in the list and by id", async () => {
		const wrapper = createQueryWrapper();
		await loginAs(wrapper);

		const list = renderHook(() => useAgents(), { wrapper });
		await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
		expect(list.result.current.data).toEqual([]);

		const created = await createAgent(wrapper, safeAgent);
		expect(created).toMatchObject({
			name: "Uptime checker",
			flagged: false,
			last_run: null,
		});
		expect(created.tools[0]).not.toHaveProperty("credentials");

		await waitFor(() => expect(list.result.current.data).toHaveLength(1));

		const byId = renderHook(() => useAgent(created.id), { wrapper });
		await waitFor(() => expect(byId.result.current.data?.id).toBe(created.id));
	});

	it("keeps agents private to the user who created them", async () => {
		const first = createQueryWrapper();
		await loginAs(first, "first@example.com");
		await createAgent(first, safeAgent);

		const second = createQueryWrapper();
		await loginAs(second, "second@example.com");
		const list = renderHook(() => useAgents(), { wrapper: second });
		await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
		expect(list.result.current.data).toEqual([]);
	});
});

describe("run hooks", () => {
	it("starts a run queued and polls it through running to succeeded", async () => {
		const wrapper = createQueryWrapper();
		await loginAs(wrapper);
		const agent = await createAgent(wrapper, safeAgent);

		const run = await startRun(wrapper, agent.id);
		expect(run.status).toBe("queued");

		// Record every status the hook renders, so intermediate states are
		// observed even when polling is much faster than waitFor's own interval.
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
		expect(poll.result.current.data?.finished_at).toBeTruthy();

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

	it("kills a run whose HTTP tool targets the cloud metadata address and records a finding", async () => {
		const wrapper = createQueryWrapper();
		await loginAs(wrapper);
		const agent = await createAgent(wrapper, rogueAgent);
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
			rule: "ssrf.metadata_endpoint",
			agent_id: agent.id,
		});

		const detail = renderHook(() => useAgent(agent.id), { wrapper });
		await waitFor(() => expect(detail.result.current.data?.flagged).toBe(true));
	});
});
