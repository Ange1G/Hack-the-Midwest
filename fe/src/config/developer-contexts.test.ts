import { describe, expect, it } from "vitest";
import {
	initialsFromDisplayName,
	resolveDeveloperContext,
} from "./developer-contexts";

describe("resolveDeveloperContext", () => {
	it("uses the developer preset for the demo admin email", () => {
		const ctx = resolveDeveloperContext({
			id: "usr_demo",
			email: "admin@example.com",
			created_at: "2026-10-10T00:00:00Z",
		});
		expect(ctx.displayName).toBe("Demo Admin");
		expect(ctx.authProvider).toBe("password");
		expect(ctx.authProviderLabel).toBe("Email & password");
		expect(ctx.initials).toBe("DA");
	});

	it("derives display name and initials for unknown emails", () => {
		const ctx = resolveDeveloperContext({
			id: "usr_1",
			email: "angel@example.com",
			created_at: "2026-10-10T00:00:00Z",
		});
		expect(ctx.displayName).toBe("Angel");
		expect(ctx.initials).toBe("AN");
	});
});

describe("initialsFromDisplayName", () => {
	it("uses two initials for multi-word names", () => {
		expect(initialsFromDisplayName("Jane Doe", "jane@example.com")).toBe("JD");
	});
});
