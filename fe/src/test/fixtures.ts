import type { AgentInput } from "#/lib/api/schemas";

// Create bodies in the team-spec shape (see api/README.md "Create an agent").

export const safeAgentInput: AgentInput = {
	agentTitle: "Uptime checker",
	systemPrompt: "Check the status page and summarise it.",
	configurations: {
		primitives: {
			status: {
				contractVersion: 1,
				method: "GET",
				URL: "https://status.example.com/api/v2/status.json",
			},
		},
		dayOfWeek: [],
		timeOfDay: [],
	},
};
