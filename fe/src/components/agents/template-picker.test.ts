import { describe, expect, it } from "vitest";
import type { Connector } from "#/lib/api/schemas";
import { mockAgentTemplates, mockIntegrations } from "#/mocks/catalog";
import { resolveTemplate } from "./template-picker";

function connector(
	id: string,
	url: string,
	created_at: string,
	type = "mcp",
): Connector {
	return {
		id,
		owner_user_sso: "ada",
		type,
		name: id,
		contract: { type, config: { URL: url } },
		created_at,
		updated_at: created_at,
	};
}

const pageWatcher = mockAgentTemplates.find(
	(item) => item.id === "page_watcher",
);
if (!pageWatcher) throw new Error("page_watcher template missing");

describe("resolveTemplate", () => {
	it("attaches the newest install with the template's allowed tools", () => {
		const { preset, missing } = resolveTemplate(pageWatcher, mockIntegrations, [
			connector("old", "https://api.agenty.ai/mcp", "2026-01-01T00:00:00Z"),
			connector("new", "https://api.agenty.ai/mcp", "2026-02-01T00:00:00Z"),
			connector("other", "https://mcp.example.com", "2026-03-01T00:00:00Z"),
		]);
		expect(missing).toEqual([]);
		expect(preset).toMatchObject({
			title: "Page watcher",
			memory: true,
			attachments: [{ connectorId: "new", allowedTools: ["markdown"] }],
		});
	});

	it("reports integrations that are not installed yet", () => {
		const { preset, missing } = resolveTemplate(
			pageWatcher,
			mockIntegrations,
			[],
		);
		expect(preset.attachments).toEqual([]);
		expect(missing.map((item) => item.id)).toEqual(["agenty"]);
	});
});
