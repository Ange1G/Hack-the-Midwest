import { DEMO_USER_SSO } from "./demo-account";
import { createAgent, createRun, runToCompletion } from "./state";

// Demo data for mock mode so every screen has something to show. Sign in with
// any other SSO id to see the empty states.
export function seedDemoState(): void {
	const uptime = createAgent(DEMO_USER_SSO, {
		title: "Uptime checker",
		system_prompt:
			"Every hour, fetch the status page and summarise any incidents in two sentences.",
		configurations: {
			tools: [
				{ kind: "http.get", config: { url: "https://status.example.com" } },
			],
		},
	});
	runToCompletion(createRun(uptime));

	createAgent(DEMO_USER_SSO, {
		title: "DevRev ticket triage",
		system_prompt:
			"Read new support tickets from DevRev, label them by urgency, and draft a first reply for the critical ones.",
		configurations: {
			tools: [{ kind: "mcp", config: { url: "https://mcp.devrev.ai" } }],
		},
	});

	const rogue = createAgent(DEMO_USER_SSO, {
		title: "Metadata scraper",
		system_prompt: "Fetch the instance metadata and print whatever you find.",
		configurations: {
			tools: [
				{
					kind: "http.get",
					config: { url: "http://169.254.169.254/latest/meta-data/" },
				},
			],
		},
	});
	runToCompletion(createRun(rogue));
}
