import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createConnector } from "#/mocks/state";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { ConnectorList } from "./connector-list";

describe("ConnectorList", () => {
	it("shows an empty state with a link to create a connector", async () => {
		signInAs();
		renderWithProviders(<ConnectorList />);
		expect(await screen.findByText(/no connectors yet/i)).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: /new connector/i }),
		).toHaveAttribute("href", "/connectors/new");
	});

	it("lists connectors by name and type", async () => {
		const owner = signInAs();
		createConnector(owner.user_sso, {
			type: "http",
			contractVersion: 1,
			name: "status",
			config: {
				method: "GET",
				URL: "https://status.example.com/api/v2/status.json",
			},
		});
		renderWithProviders(<ConnectorList />);
		const table = await screen.findByRole("table");
		expect(within(table).getByText("status")).toBeInTheDocument();
		expect(within(table).getByText("HTTP")).toBeInTheDocument();
	});

	it("filters the list by type from the type cards", async () => {
		const owner = signInAs();
		createConnector(owner.user_sso, {
			type: "http",
			contractVersion: 1,
			name: "status",
			config: { method: "GET", URL: "https://status.example.com" },
		});
		const user = userEvent.setup();
		renderWithProviders(<ConnectorList />);

		const mcp = await screen.findByRole("button", {
			name: "MCP connectors (0)",
		});
		const http = screen.getByRole("button", { name: "HTTP connectors (1)" });
		await user.click(mcp);
		expect(mcp).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByText("No MCP connectors yet.")).toBeInTheDocument();

		await user.click(http);
		expect(mcp).toHaveAttribute("aria-pressed", "false");
		expect(
			within(screen.getByRole("table")).getByText("status"),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Clear filter" }));
		expect(
			screen.getByRole("region", { name: "All connectors" }),
		).toBeInTheDocument();
	});
});
