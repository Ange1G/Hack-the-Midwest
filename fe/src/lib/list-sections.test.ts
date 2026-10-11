import { describe, expect, it } from "vitest";
import type { Agent } from "#/lib/api/schemas";
import {
	type AgentRunRecord,
	flaggedAgents,
	isScheduled,
	lastRunFor,
	newestFirst,
	recentlyRanAgents,
} from "./list-sections";

function agent(id: string, overrides: Partial<Agent> = {}): Agent {
	return {
		id,
		title: id,
		system_prompt: "",
		configurations: { primitives: {}, dayOfWeek: [], timeOfDay: [] },
		schedule_month: null,
		schedule_day: null,
		schedule_time: null,
		owner_user_sso: "owner",
		created_at: "2026-10-01T00:00:00Z",
		updated_at: "2026-10-01T00:00:00Z",
		flagged: false,
		last_run: null,
		...overrides,
	};
}

function execution(
	id: string,
	agentId: string,
	createdAt: string,
	status: AgentRunRecord["status"] = "succeeded",
): AgentRunRecord {
	return { id, agent_id: agentId, status, created_at: createdAt };
}

describe("lastRunFor", () => {
	it("prefers the newest known execution over the agent's summary", () => {
		const a = agent("a", {
			last_run: {
				id: "old",
				status: "failed",
				created_at: "2026-10-02T00:00:00Z",
			},
		});
		const runs = [
			execution("r1", "a", "2026-10-03T00:00:00Z"),
			execution("r2", "a", "2026-10-05T00:00:00Z", "running"),
			execution("r3", "b", "2026-10-09T00:00:00Z"),
		];
		expect(lastRunFor(a, runs)).toEqual({
			id: "r2",
			status: "running",
			created_at: "2026-10-05T00:00:00Z",
		});
	});

	it("falls back to the agent's summary, then to null", () => {
		const summary = {
			id: "s",
			status: "succeeded" as const,
			created_at: "2026-10-02T00:00:00Z",
		};
		expect(lastRunFor(agent("a", { last_run: summary }), [])).toEqual(summary);
		expect(lastRunFor(agent("a"), [])).toBeNull();
	});
});

describe("recentlyRanAgents", () => {
	const agents = [agent("never"), agent("a"), agent("b"), agent("c")];
	const runs = [
		execution("1", "a", "2026-10-03T00:00:00Z"),
		execution("2", "b", "2026-10-05T00:00:00Z"),
		execution("3", "c", "2026-10-04T00:00:00Z"),
	];

	it("orders agents with a run by newest run and skips agents that never ran", () => {
		expect(
			recentlyRanAgents(agents, runs, { limit: 5 }).map((item) => item.id),
		).toEqual(["b", "c", "a"]);
	});

	it("applies the limit and exclusion", () => {
		expect(
			recentlyRanAgents(agents, runs, {
				limit: 1,
				exclude: (item) => item.id === "b",
			}).map((item) => item.id),
		).toEqual(["c"]);
	});
});

describe("flaggedAgents", () => {
	it("returns only flagged agents, up to the limit", () => {
		const agents = [
			agent("a", { flagged: true }),
			agent("b"),
			agent("c", { flagged: true }),
		];
		expect(flaggedAgents(agents, 1).map((item) => item.id)).toEqual(["a"]);
	});
});

describe("newestFirst", () => {
	it("sorts by an ISO timestamp, newest first, without mutating the input", () => {
		const items = [
			{ id: "a", at: "2026-10-01T00:00:00Z" },
			{ id: "b", at: "2026-10-03T00:00:00Z" },
			{ id: "c", at: "2026-10-02T00:00:00Z" },
		];
		expect(
			newestFirst(items, (item) => item.at, 2).map((item) => item.id),
		).toEqual(["b", "c"]);
		expect(items.map((item) => item.id)).toEqual(["a", "b", "c"]);
	});
});

describe("isScheduled", () => {
	it("is false for a missing or empty schedule", () => {
		expect(isScheduled(null)).toBe(false);
		expect(isScheduled(undefined)).toBe(false);
		expect(isScheduled({ dayOfWeek: [], timeOfDay: [], month: null })).toBe(
			false,
		);
	});

	it("is true when any part of the schedule is set", () => {
		expect(isScheduled({ timeOfDay: [540] })).toBe(true);
		expect(isScheduled({ dayOfWeek: [1] })).toBe(true);
		expect(isScheduled({ month: 3 })).toBe(true);
	});
});
