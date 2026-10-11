import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockState } from "#/mocks/state";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { ConnectorForm } from "./connector-form";

describe("ConnectorForm", () => {
	it("creates an HTTP connector with query params", async () => {
		signInAs();
		const user = userEvent.setup();
		renderWithProviders(<ConnectorForm onCreated={vi.fn()} />);

		await user.type(await screen.findByLabelText(/^name$/i), "search");
		await user.type(
			screen.getByLabelText(/^url$/i),
			"https://api.example.com/search",
		);
		await user.type(
			screen.getByLabelText(/query parameters the agent may set/i),
			"q, limit",
		);
		await user.click(screen.getByRole("button", { name: /create connector/i }));

		await waitFor(() => expect(mockState.connectors).toHaveLength(1));
		expect(mockState.connectors[0]).toMatchObject({
			type: "http",
			name: "search",
			contract: {
				config: {
					method: "GET",
					URL: "https://api.example.com/search",
					queryParams: ["q", "limit"],
				},
			},
		});
	});

	it("starts on the knowledge type and creates a knowledge connector", async () => {
		signInAs();
		const user = userEvent.setup();
		const onCreated = vi.fn();
		renderWithProviders(
			<ConnectorForm initialType="knowledge" onCreated={onCreated} />,
		);

		expect(
			await screen.findByRole("radio", { name: /knowledge/i }),
		).toBeChecked();
		await user.type(screen.getByLabelText(/^name$/i), "runbooks");
		await user.click(screen.getByRole("button", { name: /create connector/i }));

		await waitFor(() =>
			expect(onCreated).toHaveBeenCalledWith(
				expect.objectContaining({ type: "knowledge", name: "runbooks" }),
			),
		);
		expect(mockState.connectors[0]?.contract).toMatchObject({
			config: { maxResults: 5 },
		});
	});

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

	it("creates a notification connector without storing the URL in plain text", async () => {
		signInAs();
		const user = userEvent.setup();
		renderWithProviders(<ConnectorForm onCreated={vi.fn()} />);

		await user.click(
			await screen.findByRole("radio", { name: /notification/i }),
		);
		await user.type(screen.getByLabelText(/^name$/i), "slack_alerts");
		await user.type(
			screen.getByLabelText(/destination url/i),
			"https://hooks.slack.com/services/T0/B0/notify-secret",
		);
		expect(screen.getByLabelText(/fields the agent fills/i)).toHaveValue(
			"text",
		);
		await user.click(screen.getByRole("button", { name: /create connector/i }));

		await waitFor(() => expect(mockState.connectors).toHaveLength(1));
		expect(mockState.connectors[0]).toMatchObject({
			type: "notification",
			name: "slack_alerts",
			contract: {
				config: { bodyParams: ["text"] },
				credentials: { webhookUrl: "********" },
			},
		});
		expect(JSON.stringify(mockState.connectors[0])).not.toContain(
			"notify-secret",
		);
	});

	it("refuses a notification payload that fixes a field the agent fills", async () => {
		signInAs();
		const user = userEvent.setup();
		renderWithProviders(<ConnectorForm onCreated={vi.fn()} />);

		await user.click(
			await screen.findByRole("radio", { name: /notification/i }),
		);
		await user.type(screen.getByLabelText(/^name$/i), "pager");
		await user.type(
			screen.getByLabelText(/destination url/i),
			"https://events.example.com/hook",
		);
		await user.type(
			screen.getByLabelText(/fixed fields/i),
			'{{"text": "fixed"}',
		);
		await user.click(screen.getByRole("button", { name: /create connector/i }));

		expect(
			await screen.findByText(/already fixed in the payload: text/i),
		).toBeInTheDocument();
		expect(mockState.connectors).toHaveLength(0);
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
