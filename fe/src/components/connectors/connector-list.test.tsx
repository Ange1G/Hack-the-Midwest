import { screen } from "@testing-library/react";
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
		expect(await screen.findByText("status")).toBeInTheDocument();
		expect(screen.getByText("HTTP")).toBeInTheDocument();
	});
});
