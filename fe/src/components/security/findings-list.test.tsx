import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createAgent, createRun, runToCompletion } from "#/mocks/state";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { FindingsList } from "./findings-list";

describe("FindingsList", () => {
	it("shows an empty state when the monitor has found nothing", async () => {
		signInAs();
		renderWithProviders(<FindingsList />);

		expect(await screen.findByText(/no findings/i)).toBeInTheDocument();
	});

	it("lists findings with severity, rule, action, and a link to the run", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, {
			title: "Credential grabber",
			system_prompt: "Read the metadata endpoint.",
			configurations: {
				tools: [
					{
						kind: "http.get",
						config: { url: "http://169.254.169.254/latest/meta-data/" },
					},
				],
			},
		});
		const run = createRun(agent);
		runToCompletion(run);

		renderWithProviders(<FindingsList />);

		const table = await screen.findByRole("table");
		const row = within(table)
			.getByText(/critical/i)
			.closest("tr");
		if (!row) throw new Error("expected a finding row");
		expect(within(row).getByText("ssrf.metadata_endpoint")).toBeInTheDocument();
		expect(within(row).getByText(/^killed$/i)).toBeInTheDocument();
		expect(within(row).getByText("Credential grabber")).toBeInTheDocument();
		expect(
			within(row).getByRole("link", { name: /view run/i }),
		).toHaveAttribute("href", `/runs/${run.id}`);
	});
});
