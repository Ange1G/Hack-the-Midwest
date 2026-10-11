import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Run } from "#/lib/api/schemas";
import { renderWithProviders } from "#/test/render";
import { RunDetails } from "./run-details";

const baseRun: Run = {
	id: "run_1",
	agent_id: "agt_1",
	owner_user_sso: "sso-a",
	status: "succeeded",
	input: null,
	result: null,
	error_code: null,
	error_message: null,
	runner_meta: null,
	started_at: "2026-10-11T10:00:00Z",
	finished_at: "2026-10-11T10:00:05Z",
	created_at: "2026-10-11T10:00:00Z",
	updated_at: "2026-10-11T10:00:05Z",
};

describe("RunDetails structured output", () => {
	it("shows the validated JSON when the reply matched the schema", async () => {
		renderWithProviders(
			<RunDetails
				run={{
					...baseRun,
					result: {
						output: '{"severity":"high"}',
						model: "m",
						parsed: { severity: "high" },
					},
				}}
			/>,
		);

		expect(await screen.findByText("Structured output")).toBeInTheDocument();
		expect(screen.getByText(/"severity": "high"/)).toBeInTheDocument();
	});

	it("explains a schema failure and keeps the raw reply visible", async () => {
		renderWithProviders(
			<RunDetails
				run={{
					...baseRun,
					status: "failed",
					error_code: "output_schema_mismatch",
					error_message:
						"Agent output does not match the output schema:\n$.severity: 'urgent' is not one of ['low', 'high']",
					result: { output: '{"severity":"urgent"}', model: "m" },
				}}
			/>,
		);

		expect(
			await screen.findByText("Output did not match the schema"),
		).toBeInTheDocument();
		expect(screen.getByText(/\$\.severity: 'urgent'/)).toBeInTheDocument();
		expect(
			screen.getByText(/raw reply is shown under output/i),
		).toBeInTheDocument();
		expect(screen.getByText('{"severity":"urgent"}')).toBeInTheDocument();
		expect(screen.queryByText("Structured output")).not.toBeInTheDocument();
	});

	it("keeps the generic failure title for other errors", async () => {
		renderWithProviders(
			<RunDetails
				run={{
					...baseRun,
					status: "failed",
					error_code: "llm_error",
					error_message: "Model unavailable",
				}}
			/>,
		);

		expect(await screen.findByText("Run failed")).toBeInTheDocument();
	});
});
