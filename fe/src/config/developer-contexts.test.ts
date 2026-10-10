import { describe, expect, it } from "vitest";
import {
	initialsFromDisplayName,
	resolveDeveloperContext,
} from "./developer-contexts";

describe("resolveDeveloperContext", () => {
	it("uses the developer preset for the demo admin SSO id", () => {
		const ctx = resolveDeveloperContext({ user_sso: "admin" });
		expect(ctx.displayName).toBe("Demo Admin");
		expect(ctx.authProvider).toBe("sso");
		expect(ctx.authProviderLabel).toBe("Development SSO");
		expect(ctx.initials).toBe("DA");
		expect(ctx.email).toBe("admin");
	});

	it("derives display name and initials for unknown SSO ids", () => {
		const ctx = resolveDeveloperContext({ user_sso: "angel" });
		expect(ctx.displayName).toBe("Angel");
		expect(ctx.initials).toBe("AN");
		expect(ctx.email).toBe("angel");
	});
});

describe("initialsFromDisplayName", () => {
	it("uses two initials for multi-word names", () => {
		expect(initialsFromDisplayName("Jane Doe", "jane")).toBe("JD");
	});
});
