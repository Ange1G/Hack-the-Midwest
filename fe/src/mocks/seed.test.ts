import { describe, expect, it } from "vitest";
import { DEFAULT_DEV_USER_SSO } from "#/config/developer-contexts";
import { seedDemoState } from "./seed";
import { mockState } from "./state";

describe("seedDemoState", () => {
	it("seeds agents for the default developer identity", () => {
		seedDemoState();

		expect(mockState.agents.length).toBeGreaterThan(0);
		expect(
			mockState.agents.every(
				(agent) => agent.owner_user_sso === DEFAULT_DEV_USER_SSO,
			),
		).toBe(true);
	});

	it("seeds a completed run so the run page has something to show", () => {
		seedDemoState();

		expect(mockState.runs.some((run) => run.status === "succeeded")).toBe(true);
		expect(
			mockState.agents.some((agent) => agent.last_run?.status === "succeeded"),
		).toBe(true);
	});
});
