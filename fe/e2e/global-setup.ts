import { chromium, type FullConfig } from "@playwright/test";

// Vite compiles the app on the first request. Loading it once here, before the
// workers start, keeps four parallel cold starts from racing the expect timeout
// on a slow machine.
export default async function warmUp(config: FullConfig): Promise<void> {
	const baseURL =
		config.projects[0]?.use.baseURL ?? "http://localhost:3100";
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.goto(`${baseURL}/agents`);
		await page
			.getByRole("heading", { name: "Agents", exact: true })
			.waitFor({ timeout: 120_000 });
	} finally {
		await browser.close();
	}
}
