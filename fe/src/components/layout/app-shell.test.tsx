import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "#/test/render";
import { AppShell } from "./app-shell";

const me = { user_sso: "angel" };

describe("AppShell", () => {
	it("shows primary navigation, the signed-in identity, and the page body", async () => {
		renderWithProviders(
			<AppShell user={me} onLoggedOut={vi.fn()}>
				<p>Page body</p>
			</AppShell>,
		);

		const nav = await screen.findByRole("navigation", { name: /main/i });
		expect(within(nav).getByRole("link", { name: /agents/i })).toHaveAttribute(
			"href",
			"/agents",
		);
		expect(
			within(nav).getByRole("link", { name: /security/i }),
		).toHaveAttribute("href", "/security");
		expect(screen.getByText("angel")).toBeInTheDocument();
		expect(screen.getByText("Page body")).toBeInTheDocument();
	});

	it("marks the active section in the sidebar from the current path", async () => {
		renderWithProviders(
			<AppShell user={me} onLoggedOut={vi.fn()}>
				<p>Page body</p>
			</AppShell>,
			{ path: "/agents" },
		);

		const nav = await screen.findByRole("navigation", { name: /main/i });
		const agents = within(nav).getByRole("link", { name: /agents/i });
		expect(agents).toHaveAttribute("data-active", "true");
		expect(agents).toHaveClass("bg-sidebar-accent");

		const security = within(nav).getByRole("link", { name: /security/i });
		expect(security.getAttribute("data-active")).not.toBe("true");
	});

	it("signs out and notifies the caller", async () => {
		const user = userEvent.setup();
		const onLoggedOut = vi.fn();
		renderWithProviders(
			<AppShell user={me} onLoggedOut={onLoggedOut}>
				<p>Page body</p>
			</AppShell>,
		);

		await user.click(
			await screen.findByRole("button", {
				name: /account menu for angel@example.com/i,
			}),
		);
		await user.click(
			await screen.findByRole("menuitem", { name: /sign out/i }),
		);

		await waitFor(() => expect(onLoggedOut).toHaveBeenCalled());
	});
});
