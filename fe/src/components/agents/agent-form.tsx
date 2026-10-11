import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import {
	buildInput,
	draftsFromAgent,
	emptySchedule,
	errorsFromServer,
	type FormErrors,
	type ScheduleDraft,
	type ToolDraft,
} from "#/components/agents/agent-form-model";
import { ScheduleSection } from "#/components/agents/schedule-section";
import { ToolsSection } from "#/components/agents/tools/tools-section";
import { FieldErrors, fieldErrorMessages } from "#/components/form-field";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { ApiError } from "#/lib/api/client";
import { useCreateAgent } from "#/lib/api/queries";
import { type Agent, agentInputSchema } from "#/lib/api/schemas";

// The agent builder, shared by /agents/new (creates) and
// /agents/$agentId/edit (prefilled, read-only until saving exists).
export function AgentForm({
	onCreated,
	agent,
	readOnly = false,
}: {
	onCreated?: (agent: Agent) => void;
	agent?: Agent;
	readOnly?: boolean;
}) {
	const createAgent = useCreateAgent();
	const [initial] = useState(() => (agent ? draftsFromAgent(agent) : null));
	const [tools, setTools] = useState<ToolDraft[]>(initial?.tools ?? []);
	const [schedule, setSchedule] = useState<ScheduleDraft>(
		initial?.schedule ?? emptySchedule(),
	);
	const [errors, setErrors] = useState<FormErrors>({});

	const form = useForm({
		defaultValues: initial?.basics ?? { name: "", instructions: "" },
		onSubmit: ({ value }) => {
			if (readOnly || !onCreated) return;
			const {
				input,
				errors: problems,
				primitiveIndex,
			} = buildInput(value, tools, schedule);
			setErrors(problems);
			if (Object.keys(problems).length > 0) return;
			createAgent.mutate(input, {
				onSuccess: (created) => onCreated(created),
				onError: (error) => {
					if (error instanceof ApiError && error.fields) {
						setErrors(errorsFromServer(error.fields, primitiveIndex));
					}
				},
			});
		},
	});

	return (
		<form
			noValidate
			className="max-w-2xl space-y-8"
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<div className="space-y-4">
				<form.Field
					name="name"
					validators={{ onSubmit: agentInputSchema.shape.agentTitle }}
				>
					{(field) => (
						<div className="space-y-1.5">
							<Label htmlFor="agent-name">Name</Label>
							<Input
								id="agent-name"
								name={field.name}
								placeholder="Weekday GitHub digest"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								disabled={readOnly}
								aria-invalid={fieldErrorMessages(field).length > 0}
								aria-describedby="agent-name-error"
							/>
							<FieldErrors field={field} id="agent-name-error" />
						</div>
					)}
				</form.Field>

				<form.Field
					name="instructions"
					validators={{ onSubmit: agentInputSchema.shape.systemPrompt }}
				>
					{(field) => (
						<div className="space-y-1.5">
							<Label htmlFor="agent-instructions">Instructions</Label>
							<Textarea
								id="agent-instructions"
								name={field.name}
								rows={5}
								placeholder="What should this agent do, in plain English?"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								disabled={readOnly}
								aria-invalid={fieldErrorMessages(field).length > 0}
								aria-describedby="agent-instructions-error"
							/>
							<FieldErrors field={field} id="agent-instructions-error" />
						</div>
					)}
				</form.Field>
			</div>

			<ToolsSection
				tools={tools}
				errors={errors}
				readOnly={readOnly}
				onChange={setTools}
			/>

			<ScheduleSection
				schedule={schedule}
				errors={errors}
				readOnly={readOnly}
				onChange={(patch) =>
					setSchedule((previous) => ({ ...previous, ...patch }))
				}
			/>

			{errors.form ? (
				<p role="alert" className="text-sm text-destructive">
					{errors.form}
				</p>
			) : null}
			{createAgent.error &&
			!(createAgent.error instanceof ApiError && createAgent.error.fields) ? (
				<p role="alert" className="text-sm text-destructive">
					{createAgent.error.message}
				</p>
			) : null}

			{readOnly ? (
				<div className="space-y-2">
					<Button type="submit" disabled>
						Save changes
					</Button>
					<p className="text-sm text-muted-foreground">
						Saving changes is not available yet.
					</p>
				</div>
			) : (
				<Button type="submit" disabled={createAgent.isPending}>
					{createAgent.isPending ? "Creating…" : "Create agent"}
				</Button>
			)}
		</form>
	);
}
