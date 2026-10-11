import { DEFAULT_DEV_USER_SSO } from "#/config/developer-contexts";
import { createAgent, createRun, runToCompletion } from "./state";

// Demo data for mock mode so every screen has something to show. Everything
// belongs to the default developer identity; set VITE_DEV_USER_SSO to another
// id to see the empty states.
export function seedDemoState(): void {
	const uptime = createAgent(DEFAULT_DEV_USER_SSO, {
		agentTitle: "Uptime checker",
		systemPrompt:
			"Every hour, fetch the status page and summarise any incidents in two sentences.",
		configurations: {
			primitives: {
				status: {
					contractVersion: 1,
					method: "GET",
					URL: "https://status.example.com/api/v2/status.json",
					options: { retries: 2, timeout: 10000 },
				},
			},
			dayOfWeek: [0, 1, 2, 3, 4, 5, 6],
			timeOfDay: [0, 360, 720, 1080],
		},
	});
	runToCompletion(createRun(uptime));

	createAgent(DEFAULT_DEV_USER_SSO, {
		agentTitle: "DevRev ticket triage",
		systemPrompt:
			"Read new support tickets from DevRev, label them by urgency, and draft a first reply for the critical ones.",
		configurations: {
			primitives: {
				list_tickets: {
					contractVersion: 1,
					method: "POST",
					URL: "https://api.devrev.ai/works.list",
					payload: { type: ["ticket"], limit: 20 },
					authorizationHeader: "Bearer demo-token",
				},
			},
			dayOfWeek: [1, 2, 3, 4, 5],
			timeOfDay: [540],
		},
	});
}
