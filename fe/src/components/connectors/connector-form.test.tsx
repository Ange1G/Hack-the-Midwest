import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockState } from "#/mocks/state";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { ConnectorForm } from "./connector-form";

describe("ConnectorForm", () => {
	it("creates an HTTP connector and refuses a private URL", async () => {
		signInAs();
		const user = userEvent.setup();
		renderWithProviders(<ConnectorForm onCreated={vi.fn()} />);

		await user.type(await screen.findByLabelText(/^name$/i), "scrape");
		await user.type(
			screen.getByLabelText(/^url$/i),
			"http://169.254.169.254/latest/meta-data/",
		);
		await user.click(screen.getByRole("button", { name: /create connector/i }));

		expect(
			await screen.findByText(
				/private, loopback and link-local addresses are not allowed/i,
			),
		).toBeInTheDocument();
		expect(mockState.connectors).toHaveLength(0);
	});

	it("creates an MCP connector", async () => {
		signInAs();
		const user = userEvent.setup();
		renderWithProviders(<ConnectorForm onCreated={vi.fn()} />);

		await user.click(await screen.findByRole("radio", { name: /mcp/i }));
		await user.type(await screen.findByLabelText(/^name$/i), "linear");
		await user.type(
			screen.getByLabelText(/server url/i),
			"https://mcp.linear.example.com/mcp",
		);
		await user.click(screen.getByRole("button", { name: /create connector/i }));

		await waitFor(() => expect(mockState.connectors).toHaveLength(1));
		expect(mockState.connectors[0]).toMatchObject({
			type: "mcp",
			name: "linear",
		});
	});

	it("creates an external database connector", async () => {
		signInAs();
		const user = userEvent.setup();
		renderWithProviders(<ConnectorForm onCreated={vi.fn()} />);

		await user.click(await screen.findByRole("radio", { name: /database/i }));
		await user.type(screen.getByLabelText(/^name$/i), "orders_db");
		await user.type(screen.getByLabelText(/^host$/i), "db.example.com");
		await user.type(screen.getByLabelText(/^database$/i), "orders");
		await user.type(screen.getByLabelText(/^username$/i), "agent_reader");
		await user.type(screen.getByLabelText(/^password$/i), "db-secret-456");
		await user.click(screen.getByRole("button", { name: /create connector/i }));

		await waitFor(() => expect(mockState.connectors).toHaveLength(1));
		expect(mockState.connectors[0]).toMatchObject({
			type: "database",
			name: "orders_db",
		});
	});
});
