import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { server } from "#/mocks/server";
import { mockState } from "#/mocks/state";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { AgentForm } from "./agent-form";

describe("AgentForm", () => {
	it("lists the platform tools and reveals a tool's fields when it is selected", async () => {
		signInAs();
		const user = userEvent.setup();
		renderWithProviders(<AgentForm onCreated={vi.fn()} />);

		const httpGet = await screen.findByRole("checkbox", { name: /http get/i });
		expect(
			screen.getByRole("checkbox", { name: /mcp connector/i }),
		).toBeInTheDocument();
		expect(screen.queryByLabelText(/^url$/i)).not.toBeInTheDocument();

		await user.click(httpGet);

		expect(screen.getByLabelText(/^url$/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/bearer token/i)).toBeInTheDocument();
	});

	it("requires a name and instructions before calling the API", async () => {
		signInAs();
		const user = userEvent.setup();
		const onCreated = vi.fn();
		renderWithProviders(<AgentForm onCreated={onCreated} />);

		await user.click(
			await screen.findByRole("button", { name: /create agent/i }),
		);

		expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
		expect(screen.getByText(/instructions are required/i)).toBeInTheDocument();
		expect(onCreated).not.toHaveBeenCalled();
		expect(mockState.agents).toHaveLength(0);
	});

	it("requires a selected tool's required config before calling the API", async () => {
		signInAs();
		const user = userEvent.setup();
		const onCreated = vi.fn();
		renderWithProviders(<AgentForm onCreated={onCreated} />);

		await user.type(await screen.findByLabelText(/^name$/i), "Uptime checker");
		await user.type(
			screen.getByLabelText(/instructions/i),
			"Check the status page.",
		);
		await user.click(screen.getByRole("checkbox", { name: /http get/i }));
		await user.click(screen.getByRole("button", { name: /create agent/i }));

		expect(await screen.findByText(/url is required/i)).toBeInTheDocument();
		expect(onCreated).not.toHaveBeenCalled();
		expect(mockState.agents).toHaveLength(0);
	});

	it("creates the agent with the backend's field names and keeps credentials out of configurations", async () => {
		signInAs();
		const user = userEvent.setup();
		const onCreated = vi.fn();
		let sent: unknown;
		server.events.on("request:start", async ({ request }) => {
			if (request.method === "POST" && request.url.includes("/agents/")) {
				sent = await request.clone().json();
			}
		});
		renderWithProviders(<AgentForm onCreated={onCreated} />);

		await user.type(await screen.findByLabelText(/^name$/i), "Uptime checker");
		await user.type(
			screen.getByLabelText(/instructions/i),
			"Check the status page every hour.",
		);
		await user.click(screen.getByRole("checkbox", { name: /http get/i }));
		await user.type(
			screen.getByLabelText(/^url$/i),
			"https://status.example.com",
		);
		await user.type(screen.getByLabelText(/bearer token/i), "secret-token");
		await user.click(screen.getByRole("button", { name: /create agent/i }));

		await waitFor(() =>
			expect(onCreated).toHaveBeenCalledWith(
				expect.objectContaining({ title: "Uptime checker" }),
			),
		);
		const created = onCreated.mock.calls[0]?.[0];
		expect(created.configurations.tools).toEqual([
			{ kind: "http.get", config: { url: "https://status.example.com" } },
		]);
		expect(sent).toEqual({
			title: "Uptime checker",
			system_prompt: "Check the status page every hour.",
			configurations: {
				tools: [
					{ kind: "http.get", config: { url: "https://status.example.com" } },
				],
			},
			credentials: [
				{ tool: "http.get", values: { bearer_token: "secret-token" } },
			],
		});
	});
});
