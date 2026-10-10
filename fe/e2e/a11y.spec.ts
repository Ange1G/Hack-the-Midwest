import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// Automated WCAG 2.1 AA scan (axe-core, the engine behind Lighthouse's
// accessibility audit) of every screen in the demo flow. The navigation bar
// is excluded because it is styled separately; see spec implementation.md.
async function expectAccessible(page: Page, screenName: string) {
	const results = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
		.exclude("aside")
		.analyze();
	const blocking = results.violations.filter(
		(violation) =>
			violation.impact === "serious" || violation.impact === "critical",
	);
	const report = blocking.map((violation) => ({
		rule: violation.id,
		impact: violation.impact,
		help: violation.help,
		nodes: violation.nodes.map((node) => ({
			target: node.target,
			summary: node.failureSummary,
		})),
	}));
	expect(report, `${screenName}: ${JSON.stringify(report, null, 2)}`).toEqual(
		[],
	);
}

test("signed-out screens have no serious accessibility violations", async ({
	page,
}) => {
	await page.goto("/login");
	await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
	await expectAccessible(page, "login");

	await page.goto("/signup");
	await expect(
		page.getByRole("button", { name: "Create account" }),
	).toBeVisible();
	await expectAccessible(page, "signup");
});

test("signed-in screens have no serious accessibility violations", async ({
	page,
}) => {
	await page.goto("/login");
	await page.getByLabel("Email", { exact: true }).fill("admin@example.com");
	await page.getByLabel("Password", { exact: true }).fill("password");
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(
		page.getByRole("heading", { name: "Agents", exact: true }),
	).toBeVisible();
	await expect(page.getByRole("link", { name: "Metadata scraper" })).toBeVisible();
	await expectAccessible(page, "agents list");

	await page.getByRole("link", { name: "New agent" }).click();
	await page.getByRole("checkbox", { name: "HTTP GET" }).click();
	await expect(page.getByLabel("URL", { exact: true })).toBeVisible();
	await expectAccessible(page, "agent builder");

	await page.getByRole("link", { name: "Agents", exact: true }).click();
	await page.getByRole("link", { name: "Metadata scraper" }).click();
	await expect(
		page.getByRole("heading", { name: "Metadata scraper" }),
	).toBeVisible();
	await expectAccessible(page, "agent detail");

	await page.getByRole("tab", { name: "Runs" }).click();
	await page.getByRole("link", { name: "View" }).first().click();
	await expect(page.getByRole("alert")).toContainText(
		"Terminated by the security monitor",
	);
	await expectAccessible(page, "killed run");

	await page.getByRole("link", { name: "Security" }).click();
	await expect(page.getByText("ssrf.metadata_endpoint")).toBeVisible();
	await expectAccessible(page, "security findings");
});
