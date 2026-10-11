import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { server } from "#/mocks/server";
import { mockState } from "#/mocks/state";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { IntegrationCatalog } from "./integration-catalog";

describe("IntegrationCatalog", () => {
	it("lists the platform integrations", async () => {
		signInAs();
		renderWithProviders(<IntegrationCatalog />);
		expect(await screen.findByText("Exa web search")).toBeInTheDocument();
		expect(screen.getByText("Agenty browser tools")).toBeInTheDocument();
		expect(screen.getByText("AgentQL extraction")).toBeInTheDocument();
	});

	it("asks for a key when the integration requires one", async () => {
		signInAs();
		const user = userEvent.setup();
		renderWithProviders(<IntegrationCatalog />);
		await user.click(
			await screen.findByRole("button", { name: "Install AgentQL extraction" }),
		);
		const sheet = await screen.findByRole("dialog");
		await user.click(
			within(sheet).getByRole("button", { name: "Install AgentQL extraction" }),
		);
		expect(
			await within(sheet).findByText("AgentQL needs an API key"),
		).toBeInTheDocument();
		expect(mockState.connectors).toHaveLength(0);
	});

	it("installs with a key without echoing it back, then shows it installed", async () => {
		signInAs();
		const user = userEvent.setup();
		let sent: unknown;
		server.events.on("request:start", async ({ request }) => {
			if (request.url.includes("/install")) sent = await request.clone().json();
		});
		renderWithProviders(<IntegrationCatalog />);
		await user.click(
			await screen.findByRole("button", { name: "Install Exa web search" }),
		);
		const sheet = await screen.findByRole("dialog");
		await user.type(within(sheet).getByLabelText(/api key/i), "exa-secret");
		await user.click(
			within(sheet).getByRole("button", { name: "Install Exa web search" }),
		);

		await waitFor(() => expect(mockState.connectors).toHaveLength(1));
		expect(sent).toEqual({ apiKey: "exa-secret" });
		expect(JSON.stringify(mockState.connectors[0])).not.toContain("exa-secret");
		expect(
			await screen.findByRole("link", { name: /installed/i }),
		).toHaveAttribute("href", `/connectors/${mockState.connectors[0]?.id}`);
		expect(
			screen.getByRole("button", { name: "Install another Exa web search" }),
		).toBeInTheDocument();
	});
});
