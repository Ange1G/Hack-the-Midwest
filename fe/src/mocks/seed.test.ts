import { describe, expect, it } from "vitest";
import { credentialsSchema } from "#/lib/api/schemas";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./demo-account";
import { seedDemoState } from "./seed";
import { mockState } from "./state";

describe("seedDemoState", () => {
	it("creates a demo account whose credentials pass sign-in validation", () => {
		const parsed = credentialsSchema.safeParse({
			email: DEMO_EMAIL,
			password: DEMO_PASSWORD,
		});
		expect(parsed.success).toBe(true);

		seedDemoState();

		const account = mockState.users.find((user) => user.email === DEMO_EMAIL);
		expect(account?.password).toBe(DEMO_PASSWORD);
	});

	it("seeds a succeeded run, a killed run with its finding, and a flagged agent", () => {
		seedDemoState();

		const statuses = mockState.runs.map((run) => run.status);
		expect(statuses).toEqual(expect.arrayContaining(["succeeded", "killed"]));
		expect(mockState.findings).toHaveLength(1);
		expect(mockState.agents.some((agent) => agent.flagged)).toBe(true);
	});
});
