import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createConnector, mockState } from "#/mocks/state";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { ConnectorDetail } from "./connector-detail";

function seedKnowledge(owner: string) {
	return createConnector(owner, {
		type: "knowledge",
		contractVersion: 1,
		name: "runbooks",
		description: "On-call runbooks",
		config: { maxResults: 3 },
	});
}

describe("ConnectorDetail", () => {
	it("adds and deletes knowledge documents", async () => {
		const owner = signInAs();
		const connector = seedKnowledge(owner.user_sso);
		const user = userEvent.setup();
		renderWithProviders(<ConnectorDetail connectorId={connector.id} />);

		expect(
			await screen.findByRole("heading", { name: "runbooks" }),
		).toBeInTheDocument();
		expect(screen.getByText("On-call runbooks")).toBeInTheDocument();
		expect(await screen.findByText(/no documents yet/i)).toBeInTheDocument();

		await user.type(screen.getByLabelText("Title"), "Database failover");
		await user.type(
			screen.getByLabelText("Content"),
			"Promote the replica, then repoint the app.",
		);
		await user.click(screen.getByRole("button", { name: "Add document" }));

		expect(await screen.findByText("Database failover")).toBeInTheDocument();
		expect(mockState.knowledgeDocuments).toHaveLength(1);
		expect(screen.getByLabelText("Title")).toHaveValue("");

		await user.click(
			screen.getByRole("button", { name: "Delete Database failover" }),
		);
		await waitFor(() => expect(mockState.knowledgeDocuments).toHaveLength(0));
		expect(await screen.findByText(/no documents yet/i)).toBeInTheDocument();
	});

	it("validates a document before sending it", async () => {
		const owner = signInAs();
		const connector = seedKnowledge(owner.user_sso);
		const user = userEvent.setup();
		renderWithProviders(<ConnectorDetail connectorId={connector.id} />);

		await user.click(
			await screen.findByRole("button", { name: "Add document" }),
		);
		expect(screen.getByText("Title is required")).toBeInTheDocument();
		expect(screen.getByText("Content is required")).toBeInTheDocument();
		expect(mockState.knowledgeDocuments).toHaveLength(0);
	});

	it("says so when the connector does not exist", async () => {
		signInAs();
		renderWithProviders(<ConnectorDetail connectorId="con_missing" />);
		expect(await screen.findByText("Connector not found")).toBeInTheDocument();
	});
});
