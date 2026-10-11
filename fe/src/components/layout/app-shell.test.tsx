import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY } from "#/lib/theme";
import { renderWithProviders } from "#/test/render";
import { AppShell } from "./app-shell";

const me = { user_sso: "angel" };

describe("AppShell", () => {
	beforeEach(() => {
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1024,
		});
	});

	it("shows primary navigation, the current identity, and the page body", async () => {
		renderWithProviders(
			<AppShell user={me}>
				<p>Page body</p>
			</AppShell>,
		);

		await waitFor(() => {
			expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
				"data-variant",
				"floating",
			);
		});

		const nav = await screen.findByRole("navigation", { name: /main/i });
		const hrefs = within(nav)
			.getAllByRole("link")
			.map((link) => link.getAttribute("href"));
		expect(hrefs).toEqual(["/agents"]);
		expect(screen.getByText("angel")).toBeInTheDocument();
		expect(screen.getByText("Page body")).toBeInTheDocument();
	});

	it("marks the active section in the sidebar from the current path", async () => {
		renderWithProviders(
			<AppShell user={me}>
				<p>Page body</p>
			</AppShell>,
			{ path: "/agents" },
		);

		const nav = await screen.findByRole("navigation", { name: /main/i });
		const agents = within(nav).getByRole("link", { name: /agents/i });
		expect(agents).toHaveAttribute("data-active", "true");
		expect(agents).toHaveClass("bg-sidebar-accent");
	});

	it("opens an account menu that shows the identity and has no sign-out", async () => {
		const user = userEvent.setup();
		renderWithProviders(
			<AppShell user={me}>
				<p>Page body</p>
			</AppShell>,
		);

		await user.click(
			await screen.findByRole("button", {
				name: /account menu for angel/i,
			}),
		);

		const menu = await screen.findByRole("menu");
		expect(menu).toHaveTextContent("Angel");
		expect(menu).toHaveTextContent("angel");
		expect(
			within(menu).queryByRole("menuitem", { name: /sign out/i }),
		).not.toBeInTheDocument();
	});

	it("switches between light and dark from the account menu and remembers it", async () => {
		const user = userEvent.setup();
		renderWithProviders(
			<AppShell user={me}>
				<p>Page body</p>
			</AppShell>,
		);
		await user.click(
			await screen.findByRole("button", {
				name: /account menu for angel/i,
			}),
		);

		const toggle = await screen.findByRole("menuitem", { name: /theme/i });
		expect(toggle).toHaveAccessibleName("Theme: light");
		expect(toggle).toHaveTextContent("Theme");
		expect(document.documentElement).not.toHaveClass("dark");

		await user.click(toggle);

		expect(document.documentElement).toHaveClass("dark");
		expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
		// The menu stays open so the switch is visible where it was made.
		expect(
			await screen.findByRole("menuitem", { name: "Theme: dark" }),
		).toBeInTheDocument();

		await user.click(screen.getByRole("menuitem", { name: "Theme: dark" }));

		expect(document.documentElement).not.toHaveClass("dark");
		expect(
			await screen.findByRole("menuitem", { name: "Theme: light" }),
		).toBeInTheDocument();
	});
});
