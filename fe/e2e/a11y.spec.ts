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

test("the sign-in screen has no serious accessibility violations", async ({
	page,
}) => {
	await page.goto("/login");
	await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
	await expectAccessible(page, "login");
});

test("signed-in screens have no serious accessibility violations", async ({
	page,
}) => {
	await page.goto("/login");
	await page.getByLabel("SSO id", { exact: true }).fill("admin");
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(
		page.getByRole("heading", { name: "Agents", exact: true }),
	).toBeVisible();
	await expect(page.getByRole("link", { name: "Secret leaker" })).toBeVisible();
	await expectAccessible(page, "agents list");

	await page.getByRole("link", { name: "New agent" }).click();
	await page.getByRole("button", { name: "Create connector" }).click();
	await page.getByRole("radio", { name: /database/i }).first().click();
	await expect(page.getByLabel("Host")).toBeVisible();
	await expectAccessible(page, "agent builder");

	await page.getByRole("link", { name: "Connectors" }).click();
	await expect(
		page.getByRole("heading", { name: "Connectors", exact: true }),
	).toBeVisible();
	await expectAccessible(page, "connectors list");

	await page.getByRole("link", { name: "New connector" }).click();
	await page.getByRole("radio", { name: /database/i }).click();
	await expect(page.getByLabel("Host")).toBeVisible();
	await expectAccessible(page, "connector builder");

	await page.getByRole("link", { name: "Agents", exact: true }).click();
	await page.getByRole("link", { name: "Secret leaker" }).click();
	await expect(
		page.getByRole("heading", { name: "Secret leaker" }),
	).toBeVisible();
	await expectAccessible(page, "agent detail");

	await page.getByRole("tab", { name: "Runs" }).click();
	await page.getByRole("link", { name: "View" }).first().click();
	await expect(page.getByRole("alert")).toContainText(
		"Terminated by the security monitor",
	);
	await expectAccessible(page, "failed run");

	await page.getByRole("link", { name: "Webhooks" }).click();
	await expect(
		page.getByRole("heading", { name: "Webhooks", exact: true }),
	).toBeVisible();
	await expectAccessible(page, "webhooks");

	await page.getByRole("link", { name: "Chains", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "Chains", exact: true }),
	).toBeVisible();
	await expectAccessible(page, "chains list");

	await page.getByRole("link", { name: "Triage then summarize" }).click();
	await expect(
		page.getByRole("heading", { name: "Triage then summarize" }),
	).toBeVisible();
	await expectAccessible(page, "chain detail");

	await page.getByRole("link", { name: "Security" }).click();
	await expect(
		page.getByText("Security monitoring is not available yet"),
	).toBeVisible();
	await expectAccessible(page, "security findings");
});
