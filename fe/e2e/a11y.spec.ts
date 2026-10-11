import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// Automated WCAG 2.1 AA scan (axe-core, the engine behind Lighthouse's
// accessibility audit) of every screen in the demo flow. The navigation bar
// is excluded because it is styled separately; see
// spec/2026-10-10-frontend-dashboard/implementation.md.
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

// Computed `display` of the decorative body::before and body::after overlays.
function backgroundOverlays(page: Page) {
	return page.evaluate(() => [
		getComputedStyle(document.body, "::before").display,
		getComputedStyle(document.body, "::after").display,
	]);
}

test("every screen in the demo flow has no serious accessibility violations", async ({
	page,
}) => {
	await page.goto("/agents");
	await expect(
		page.getByRole("heading", { name: "Agents", exact: true }),
	).toBeVisible();
	await expect(page.getByRole("link", { name: "Uptime checker" })).toBeVisible();
	await expectAccessible(page, "agents list");

	await page.getByRole("link", { name: "New agent" }).click();
	await page.getByRole("button", { name: "Add HTTP call" }).click();
	await page.getByLabel("Method").selectOption("POST");
	await expect(page.getByLabel("Payload (JSON)")).toBeVisible();
	await expectAccessible(page, "agent builder");

	await page.getByRole("link", { name: "Agents", exact: true }).click();
	await page.getByRole("link", { name: "DevRev ticket triage" }).click();
	await expect(
		page.getByRole("heading", { name: "DevRev ticket triage" }),
	).toBeVisible();
	await expectAccessible(page, "agent detail");

	await page.getByRole("link", { name: "Agents", exact: true }).click();
	await page.getByRole("link", { name: "Uptime checker" }).click();
	await page.getByRole("tab", { name: "Runs" }).click();
	await page.getByRole("link", { name: "View run" }).first().click();
	await expect(page.getByText("Succeeded", { exact: true })).toBeVisible();
	await expectAccessible(page, "run page");

	// A run started from the list announces itself with a notification.
	await page.getByRole("link", { name: "Agents", exact: true }).click();
	await page
		.getByRole("row", { name: /DevRev ticket triage/ })
		.getByRole("button", { name: "Start" })
		.click();
	await expect(
		page
			.getByRole("region", { name: /notifications/i })
			.locator('[data-slot="toast"]')
			.filter({ hasText: "DevRev ticket triage" }),
	).toBeVisible({ timeout: 15_000 });
	await expectAccessible(page, "agents list with a notification");
});

test("dark mode is remembered across reloads and keeps the screens accessible", async ({
	page,
}) => {
	await page.goto("/agents");
	await expect(page.getByRole("link", { name: "Uptime checker" })).toBeVisible();
	await expect(page.locator("html")).not.toHaveClass(/dark/);
	expect(await backgroundOverlays(page)).toEqual(["block", "block"]);

	await page.getByRole("button", { name: /account menu/i }).click();
	await page.getByRole("menuitem", { name: "Theme: light" }).click();
	await expect(page.locator("html")).toHaveClass(/dark/);
	await expect(page.getByRole("menuitem", { name: "Theme: dark" })).toBeVisible();
	await page.keyboard.press("Escape");

	await page.reload();
	await expect(page.locator("html")).toHaveClass(/dark/);
	await expect(page.getByRole("link", { name: "Uptime checker" })).toBeVisible();
	// The light theme's glow and grid overlays read as grey circles on the dark
	// palette, so dark mode keeps a flat background.
	expect(await backgroundOverlays(page)).toEqual(["none", "none"]);
	await expectAccessible(page, "agents list (dark)");

	await page.getByRole("link", { name: "Uptime checker" }).click();
	await expect(
		page.getByRole("heading", { name: "Uptime checker" }),
	).toBeVisible();
	await expectAccessible(page, "agent detail (dark)");

	await page.getByRole("link", { name: "Agents", exact: true }).click();
	await page.getByRole("link", { name: "New agent" }).click();
	await page.getByRole("button", { name: "Add HTTP call" }).click();
	await expect(page.getByLabel("URL", { exact: true })).toBeVisible();
	await expectAccessible(page, "agent builder (dark)");
});
