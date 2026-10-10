import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	createAgent,
	createRun,
	createUser,
	mockState,
	publicUser,
	runToCompletion,
} from "#/mocks/state";
import { renderWithProviders } from "#/test/render";
import { FindingsList } from "./findings-list";

function signIn() {
	const user = createUser("angel@example.com", "correct horse battery");
	mockState.session = publicUser(user);
	return publicUser(user);
}

describe("FindingsList", () => {
	it("shows an empty state when the monitor has found nothing", async () => {
		signIn();
		renderWithProviders(<FindingsList />);

		expect(await screen.findByText(/no findings/i)).toBeInTheDocument();
	});

	it("lists findings with severity, rule, action, and a link to the run", async () => {
		const owner = signIn();
		const agent = createAgent(owner, {
			name: "Credential grabber",
			instructions: "Read the metadata endpoint.",
			tools: [
				{
					kind: "http.get",
					config: { url: "http://169.254.169.254/latest/meta-data/" },
				},
			],
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
