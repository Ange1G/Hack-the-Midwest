import { expect, type Page, test } from "@playwright/test";

async function startAgent(page: Page, name: string, instructions: string) {
	await page.getByRole("link", { name: "New agent" }).click();
	await page.getByLabel("Name", { exact: true }).fill(name);
	await page.getByLabel("Instructions", { exact: true }).fill(instructions);
	await page.getByRole("button", { name: "Add HTTP call" }).click();
}

// The judges' walkthrough, end to end, against the mock API. The app opens on
// the configured developer identity; no sign-in step exists.
test("open the dashboard, build an agent, run it, and see an unsafe agent refused", async ({
	page,
}) => {
	await page.goto("/");
	await expect(page).toHaveURL(/\/agents$/);
	await expect(
		page.getByRole("heading", { name: "Agents", exact: true }),
	).toBeVisible();
	await expect(page.getByRole("link", { name: "Uptime checker" })).toBeVisible();

	// A well-behaved agent with one HTTP call.
	await startAgent(
		page,
		"Status check",
		"Check the status page every hour and summarise it.",
	);
	await page.getByLabel("Call name").fill("status");
	await page.getByLabel("URL", { exact: true }).fill("https://status.example.com");
	await page.getByRole("button", { name: "Create agent" }).click();
	await expect(page.getByRole("heading", { name: "Status check" })).toBeVisible();

	// Run it and watch it finish.
	await page.getByRole("button", { name: "Run agent" }).click();
	await expect(page.getByText("Succeeded", { exact: true })).toBeVisible({
		timeout: 15_000,
	});
	await expect(page.getByText(/all checks passed/)).toBeVisible();
	await expect(page.getByText(/Agent "Status check" started/)).toBeVisible();

	// An agent that reaches for the cloud metadata endpoint is refused at save
	// time, exactly as the backend refuses it.
	await page.getByRole("link", { name: "Agents", exact: true }).click();
	await startAgent(page, "Metadata scraper", "Fetch the instance metadata.");
	await page.getByLabel("Call name").fill("scrape");
	await page
		.getByLabel("URL", { exact: true })
		.fill("http://169.254.169.254/latest/meta-data/");
	await page.getByRole("button", { name: "Create agent" }).click();
	await expect(
		page.getByText("Private, loopback and link-local addresses are not allowed"),
	).toBeVisible();
	await expect(page).toHaveURL(/\/agents\/new$/);
});
