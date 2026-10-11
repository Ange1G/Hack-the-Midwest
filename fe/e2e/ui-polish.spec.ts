import { expect, type Page, test } from "@playwright/test";

declare global {
	interface Window {
		__viewTransitions?: number;
	}
}

// Computed view-transition-name of the page area (the <main> content region).
function pageAreaTransitionName(page: Page) {
	return page.evaluate(() => {
		const main = document.querySelector("main");
		return main
			? getComputedStyle(main).getPropertyValue("view-transition-name")
			: null;
	});
}

test("route changes animate the page area, and only the page area", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const original = document.startViewTransition.bind(document);
		window.__viewTransitions = 0;
		document.startViewTransition = ((
			...args: Parameters<Document["startViewTransition"]>
		) => {
			window.__viewTransitions = (window.__viewTransitions ?? 0) + 1;
			return original(...args);
		}) as Document["startViewTransition"];
	});

	await page.goto("/agents");
	await expect(page.getByRole("link", { name: "Uptime checker" })).toBeVisible();
	expect(await pageAreaTransitionName(page)).toBe("page");

	await page.getByRole("link", { name: "Uptime checker" }).click();
	await expect(
		page.getByRole("heading", { name: "Uptime checker" }),
	).toBeVisible();
	expect(await page.evaluate(() => window.__viewTransitions)).toBeGreaterThan(
		0,
	);

	// While the theme switches, the page area steps out of the transition so
	// the circle reveal covers the whole screen at once.
	await page.evaluate(() =>
		document.documentElement.classList.add("theme-switching"),
	);
	expect(await pageAreaTransitionName(page)).toBe("none");
});
