import { expect, test } from "@playwright/test";

// The judges' walkthrough, end to end, against the mock API.
test("sign up, build an agent, run it, then watch the monitor kill a rogue one", async ({
	page,
}) => {
	const email = `judge-${Date.now()}@example.com`;

	await page.goto("/signup");
	await page.getByLabel("Email", { exact: true }).fill(email);
	await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
	await page.getByRole("button", { name: "Create account" }).click();

	await expect(
		page.getByRole("heading", { name: "Agents", exact: true }),
	).toBeVisible();
	await expect(page.getByText("No agents yet")).toBeVisible();

	// A well-behaved agent.
	await page.getByRole("link", { name: "New agent" }).click();
	await page.getByLabel("Name", { exact: true }).fill("Uptime checker");
	await page
		.getByLabel("Instructions", { exact: true })
		.fill("Check the status page every hour and summarise it.");
	await page.getByRole("checkbox", { name: "HTTP GET" }).click();
	await page.getByLabel("URL", { exact: true }).fill("https://status.example.com");
	await page.getByRole("button", { name: "Create agent" }).click();
	await expect(
		page.getByRole("heading", { name: "Uptime checker" }),
	).toBeVisible();

	// Run it and watch it finish.
	await page.getByRole("button", { name: "Run agent" }).click();
	await expect(page.getByText("Succeeded", { exact: true })).toBeVisible({
		timeout: 15_000,
	});
	await expect(page.getByText(/all checks passed/)).toBeVisible();
	await expect(page.getByText(/Agent "Uptime checker" started/)).toBeVisible();

	// A rogue agent that reaches for the cloud metadata endpoint.
	await page.getByRole("link", { name: "Agents", exact: true }).click();
	await page.getByRole("link", { name: "New agent" }).click();
	await page.getByLabel("Name", { exact: true }).fill("Metadata scraper");
	await page
		.getByLabel("Instructions", { exact: true })
		.fill("Fetch the instance metadata and print it.");
	await page.getByRole("checkbox", { name: "HTTP GET" }).click();
	await page
		.getByLabel("URL", { exact: true })
		.fill("http://169.254.169.254/latest/meta-data/");
	await page.getByRole("button", { name: "Create agent" }).click();
	await page.getByRole("button", { name: "Run agent" }).click();

	const alert = page.getByRole("alert");
	await expect(alert).toContainText("Terminated by the security monitor", {
		timeout: 15_000,
	});
	await expect(alert).toContainText("cloud metadata endpoint");
	await expect(page.getByText("Killed", { exact: true })).toBeVisible();

	// The finding is on the Security page and the agent is flagged in the list.
	await page.getByRole("link", { name: "Security" }).click();
	await expect(page.getByText("ssrf.metadata_endpoint")).toBeVisible();
	await expect(page.getByRole("link", { name: "Metadata scraper" })).toBeVisible();

	await page.getByRole("link", { name: "Agents", exact: true }).click();
	await expect(page.getByText("Flagged", { exact: true })).toBeVisible();
});

test("an unauthenticated visit to the app redirects to sign in", async ({
	page,
}) => {
	await page.goto("/agents");
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
