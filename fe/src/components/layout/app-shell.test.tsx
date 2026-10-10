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

	it("signs out and notifies the caller", async () => {
		const user = userEvent.setup();
		const onLoggedOut = vi.fn();
		renderWithProviders(
			<AppShell user={me} onLoggedOut={onLoggedOut}>
				<p>Page body</p>
			</AppShell>,
		);

		await user.click(await screen.findByRole("button", { name: /sign out/i }));

		await waitFor(() => expect(onLoggedOut).toHaveBeenCalled());
	});
});
