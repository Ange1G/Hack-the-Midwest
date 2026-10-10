import { DEMO_EMAIL, DEMO_PASSWORD } from "./demo-account";
import {
	createAgent,
	createRun,
	createUser,
	publicUser,
	runToCompletion,
} from "./state";

// Demo data for mock mode so every screen has something to show. Sign up with
// a fresh email instead to see the empty states.
export function seedDemoState(): void {
	const owner = publicUser(createUser(DEMO_EMAIL, DEMO_PASSWORD));

	const uptime = createAgent(owner, {
		name: "Uptime checker",
		instructions:
			"Every hour, fetch the status page and summarise any incidents in two sentences.",
		tools: [
			{ kind: "http.get", config: { url: "https://status.example.com" } },
		],
	});
	runToCompletion(createRun(uptime));

	createAgent(owner, {
		name: "DevRev ticket triage",
		instructions:
			"Read new support tickets from DevRev, label them by urgency, and draft a first reply for the critical ones.",
		tools: [{ kind: "mcp", config: { url: "https://mcp.devrev.ai" } }],
	});

	const rogue = createAgent(owner, {
		name: "Metadata scraper",
		instructions: "Fetch the instance metadata and print whatever you find.",
		tools: [
			{
				kind: "http.get",
				config: { url: "http://169.254.169.254/latest/meta-data/" },
			},
		],
	});
	runToCompletion(createRun(rogue));
}
