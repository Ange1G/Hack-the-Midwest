import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { safeAgentInput } from "#/test/fixtures";
import { actAs } from "#/test/identity";
import { createQueryWrapper } from "#/test/query";
import { api } from "./client";
import {
	isActiveRunStatus,
	useAgent,
	useAgents,
	useCreateAgent,
	useRun,
	useRunEvents,
	useStartRun,
} from "./queries";
import { type AgentInput, agentSchema, type RunStatus } from "./schemas";

type Wrapper = ReturnType<typeof createQueryWrapper>;

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

describe("agent hooks", () => {
	it("starts empty, then shows a created agent in the list and by id", async () => {
		actAs();
		const wrapper = createQueryWrapper();

		const list = renderHook(() => useAgents(), { wrapper });
		await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
		expect(list.result.current.data?.items).toEqual([]);
		expect(list.result.current.data?.pagination?.total_items).toBe(0);

		const created = await createAgent(wrapper, safeAgentInput);
		expect(created).toMatchObject({
			title: "Uptime checker",
			system_prompt: "Check the status page and summarise it.",
			owner_user_sso: "angel",
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
		actAs();
		const created = await createAgent(createQueryWrapper(), {
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
		actAs();
		const { result } = renderHook(() => useCreateAgent(), {
			wrapper: createQueryWrapper(),
		});
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
		actAs("first");
		await createAgent(createQueryWrapper(), safeAgentInput);

		actAs("second");
		const list = renderHook(() => useAgents(), {
			wrapper: createQueryWrapper(),
		});
		await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
		expect(list.result.current.data?.items).toEqual([]);
	});

	it("refuses to read another owner's agents, like the backend does", async () => {
		actAs("first");
		const error = await api
			.list("/agents/second", agentSchema)
			.catch((e: unknown) => e);
		expect(error).toMatchObject({ status: 403, code: "forbidden" });
	});
});

describe("run hooks", () => {
	it("starts a run queued and polls it through running to succeeded", async () => {
		actAs();
		const wrapper = createQueryWrapper();
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
});
