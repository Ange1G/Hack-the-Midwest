import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { FieldErrors, fieldErrorMessages } from "#/components/form-field";
import { ErrorState, LoadingState } from "#/components/states";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader } from "#/components/ui/card";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { useCreateAgent, useToolDefinitions } from "#/lib/api/queries";
import {
	type Agent,
	agentInputSchema,
	type ToolConfig,
	type ToolCredentials,
	type ToolDefinition,
} from "#/lib/api/schemas";

type ToolDraft = {
	enabled: boolean;
	config: Record<string, string>;
	credentials: Record<string, string>;
};

type Drafts = Record<string, ToolDraft>;

const emptyDraft = (): ToolDraft => ({
	enabled: false,
	config: {},
	credentials: {},
});

function emptyDrafts(definitions: ToolDefinition[]): Drafts {
	return Object.fromEntries(
		definitions.map((definition) => [definition.kind, emptyDraft()]),
	);
}

function trimValues(values: Record<string, string>): Record<string, string> {
	return Object.fromEntries(
		Object.entries(values)
			.map(([key, value]) => [key, value.trim()])
			.filter(([, value]) => value.length > 0),
	);
}

export function validateTools(
	definitions: ToolDefinition[],
	drafts: Drafts,
): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const definition of definitions) {
		const draft = drafts[definition.kind];
		if (!draft?.enabled) continue;
		for (const field of definition.config_fields) {
			if (field.required && !(draft.config[field.key] ?? "").trim()) {
				errors[`${definition.kind}.${field.key}`] =
					`${field.label} is required`;
			}
		}
	}
	return errors;
}

// Credentials travel beside the configuration, never inside it, so the
// backend can store them in a secret store instead of the agent's JSON.
export function buildTools(
	definitions: ToolDefinition[],
	drafts: Drafts,
): { tools: ToolConfig[]; credentials: ToolCredentials[] } {
	const tools: ToolConfig[] = [];
	const credentials: ToolCredentials[] = [];
	for (const definition of definitions) {
		const draft = drafts[definition.kind];
		if (!draft?.enabled) continue;
		tools.push({ kind: definition.kind, config: trimValues(draft.config) });
		const values = trimValues(draft.credentials);
		if (Object.keys(values).length > 0) {
			credentials.push({ tool: definition.kind, values });
		}
	}
	return { tools, credentials };
}

export function AgentForm({
	onCreated,
}: {
	onCreated: (agent: Agent) => void;
}) {
	const tools = useToolDefinitions();

	if (tools.isPending) {
		return <LoadingState label="Loading tools…" />;
	}
	if (tools.isError) {
		return (
			<ErrorState
				title="Could not load the platform tools"
				error={tools.error}
				onRetry={() => void tools.refetch()}
			/>
		);
	}
	return <AgentFormFields definitions={tools.data} onCreated={onCreated} />;
}

function AgentFormFields({
	definitions,
	onCreated,
}: {
	definitions: ToolDefinition[];
	onCreated: (agent: Agent) => void;
}) {
	const createAgent = useCreateAgent();
	const [drafts, setDrafts] = useState<Drafts>(() => emptyDrafts(definitions));
	const [toolErrors, setToolErrors] = useState<Record<string, string>>({});

	const form = useForm({
		defaultValues: { name: "", instructions: "" },
		onSubmit: ({ value }) => {
			const errors = validateTools(definitions, drafts);
			setToolErrors(errors);
			if (Object.keys(errors).length > 0) return;
			const { tools, credentials } = buildTools(definitions, drafts);
			createAgent.mutate(
				{
					title: value.name.trim(),
					system_prompt: value.instructions.trim(),
					configurations: { tools },
					...(credentials.length > 0 ? { credentials } : {}),
				},
				{ onSuccess: (agent) => onCreated(agent) },
			);
		},
	});

	const updateDraft = (kind: string, patch: (draft: ToolDraft) => ToolDraft) =>
		setDrafts((previous) => ({
			...previous,
			[kind]: patch(previous[kind] ?? emptyDraft()),
		}));

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
					validators={{ onSubmit: agentInputSchema.shape.title }}
				>
					{(field) => (
						<div className="space-y-1.5">
							<Label htmlFor="agent-name">Name</Label>
							<Input
								id="agent-name"
								name={field.name}
								placeholder="Uptime checker"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								aria-invalid={fieldErrorMessages(field).length > 0}
								aria-describedby="agent-name-error"
							/>
							<FieldErrors field={field} id="agent-name-error" />
						</div>
					)}
				</form.Field>

				<form.Field
					name="instructions"
					validators={{ onSubmit: agentInputSchema.shape.system_prompt }}
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
								aria-invalid={fieldErrorMessages(field).length > 0}
								aria-describedby="agent-instructions-error"
							/>
							<FieldErrors field={field} id="agent-instructions-error" />
						</div>
					)}
				</form.Field>
			</div>

			<fieldset className="space-y-3">
				<legend className="mb-2 text-base font-semibold">Tools</legend>
				<p className="text-sm text-muted-foreground">
					Pick the platform primitives this agent may use. Credentials are
					stored securely, injected at run time, and never shown again.
				</p>
				{definitions.map((definition) => {
					const draft = drafts[definition.kind] ?? emptyDraft();
					const id = `tool-${definition.kind}`;
					return (
						<Card key={definition.kind}>
							<CardHeader className="flex flex-row items-start gap-3 space-y-0">
								<Checkbox
									id={id}
									checked={draft.enabled}
									onCheckedChange={(checked) =>
										updateDraft(definition.kind, (current) => ({
											...current,
											enabled: checked === true,
										}))
									}
								/>
								<div className="space-y-1">
									<Label htmlFor={id} className="text-base">
										{definition.name}
									</Label>
									<p className="text-sm text-muted-foreground">
										{definition.description}
									</p>
								</div>
							</CardHeader>
							{draft.enabled ? (
								<CardContent className="space-y-4">
									{definition.config_fields.map((field) => {
										const fieldId = `${id}-${field.key}`;
										const error = toolErrors[`${definition.kind}.${field.key}`];
										const value = draft.config[field.key] ?? "";
										const onChange = (next: string) =>
											updateDraft(definition.kind, (current) => ({
												...current,
												config: { ...current.config, [field.key]: next },
											}));
										return (
											<div key={field.key} className="space-y-1.5">
												<Label htmlFor={fieldId}>{field.label}</Label>
												{field.type === "textarea" ? (
													<Textarea
														id={fieldId}
														rows={3}
														value={value}
														onChange={(event) => onChange(event.target.value)}
														aria-invalid={Boolean(error)}
													/>
												) : (
													<Input
														id={fieldId}
														type={field.type === "url" ? "url" : "text"}
														value={value}
														onChange={(event) => onChange(event.target.value)}
														aria-invalid={Boolean(error)}
													/>
												)}
												{error ? (
													<p className="text-sm text-destructive">{error}</p>
												) : null}
											</div>
										);
									})}
									{definition.credential_fields.map((field) => {
										const fieldId = `${id}-credential-${field.key}`;
										return (
											<div key={field.key} className="space-y-1.5">
												<Label htmlFor={fieldId}>{field.label}</Label>
												<Input
													id={fieldId}
													type="password"
													autoComplete="off"
													value={draft.credentials[field.key] ?? ""}
													onChange={(event) =>
														updateDraft(definition.kind, (current) => ({
															...current,
															credentials: {
																...current.credentials,
																[field.key]: event.target.value,
															},
														}))
													}
												/>
											</div>
										);
									})}
								</CardContent>
							) : null}
						</Card>
					);
				})}
			</fieldset>

			{createAgent.error ? (
				<p role="alert" className="text-sm text-destructive">
					{createAgent.error.message}
				</p>
			) : null}

			<Button type="submit" disabled={createAgent.isPending}>
				{createAgent.isPending ? "Creating…" : "Create agent"}
			</Button>
		</form>
	);
}
