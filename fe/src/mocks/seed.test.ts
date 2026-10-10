import { describe, expect, it } from "vitest";
import { DEMO_USER_SSO } from "./demo-account";
import { seedDemoState } from "./seed";
import { mockState } from "./state";

describe("seedDemoState", () => {
	it("seeds agents for the demo identity", () => {
		seedDemoState();

		expect(mockState.agents.length).toBeGreaterThan(0);
		expect(
			mockState.agents.every((agent) => agent.owner_user_sso === DEMO_USER_SSO),
		).toBe(true);
	});

	it("seeds a succeeded run, a killed run with its finding, and a flagged agent", () => {
		seedDemoState();

		const statuses = mockState.runs.map((run) => run.status);
		expect(statuses).toEqual(expect.arrayContaining(["succeeded", "killed"]));
		expect(mockState.findings).toHaveLength(1);
		expect(mockState.agents.some((agent) => agent.flagged)).toBe(true);
	});
});
