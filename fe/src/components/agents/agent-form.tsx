import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LinkIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import {
	buildConnectorBody,
	ConnectorDraftFields,
	ConnectorTypePicker,
	type DatabaseDraft,
	emptyDatabaseDraft,
	emptyHttpDraft,
	emptyMcpDraft,
	type HttpDraft,
	type McpDraft,
} from "#/components/connectors/connector-fields";
import { FieldErrors, fieldErrorMessages } from "#/components/form-field";
import { Section } from "#/components/layout/page";
import {
	parseScheduleTimes,
	type ScheduleDraft,
	ScheduleFields,
} from "#/components/schedule/schedule-fields";
import { ToneBadge } from "#/components/tone-badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { ApiError } from "#/lib/api/client";
import {
	createConnectorRecord,
	queryKeys,
	useConnectors,
	useConnectorTypes,
	useCreateAgent,
	useUpdateAgent,
} from "#/lib/api/queries";
import {
	type Agent,
	type AgentInput,
	agentInputSchema,
	type ConnectorType,
	connectorLabel,
} from "#/lib/api/schemas";
import { notify } from "#/lib/feedback";
import { minutesToTime } from "#/lib/http-contract";
import { transitionBase } from "#/lib/motion";
import { cn } from "#/lib/utils";

type Attachment = {
	key: number;
	mode: "library" | "create";
	connectorId: string;
	allowedTools: string;
	createType: ConnectorType;
	http: HttpDraft;
	mcp: McpDraft;
	database: DatabaseDraft;
};

let nextKey = 1;
const emptyAttachment = (mode: Attachment["mode"]): Attachment => ({
	key: nextKey++,
	mode,
	connectorId: "",
	allowedTools: "",
	createType: "http",
	http: emptyHttpDraft(),
	mcp: emptyMcpDraft(),
	database: emptyDatabaseDraft(),
});

function attachmentsFromAgent(agent: Agent): Attachment[] {
	return Object.entries(agent.configurations.primitives).map(
		([connectorId, reference]) => ({
			...emptyAttachment("library"),
			connectorId,
			allowedTools: reference.allowedTools?.join(", ") ?? "",
		}),
	);
}

function parseAllowedTools(value: string): string[] {
	return value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

function errorsForIndex(
	errors: Record<string, string>,
	index: number,
): Record<string, string> {
	const prefix = `attachments.${index}.`;
	const next: Record<string, string> = {};
	for (const [key, message] of Object.entries(errors)) {
		if (key.startsWith(prefix)) next[key.slice(prefix.length)] = message;
	}
	return next;
}

function prefixErrors(
	errors: Record<string, string>,
	index: number,
): Record<string, string> {
	const prefixed: Record<string, string> = {};
	for (const [key, message] of Object.entries(errors)) {
		prefixed[`attachments.${index}.${key}`] = message;
	}
	return prefixed;
}

function patchAttachment(
	attachments: Attachment[],
	key: number,
	patch: Partial<Attachment>,
): Attachment[] {
	return attachments.map((item) =>
		item.key === key ? { ...item, ...patch } : item,
	);
}

export function AgentForm({
	onSaved,
	agent,
}: {
	onSaved?: (agent: Agent) => void;
	agent?: Agent;
}) {
	const queryClient = useQueryClient();
	const createAgent = useCreateAgent();
	const updateAgent = useUpdateAgent();
	const connectors = useConnectors();
	const catalog = useConnectorTypes();
	const [attachments, setAttachments] = useState<Attachment[]>(
		agent ? attachmentsFromAgent(agent) : [],
	);
	const [schedule, setSchedule] = useState<ScheduleDraft>({
		days: agent ? [...agent.configurations.dayOfWeek] : [],
		times: agent
			? agent.configurations.timeOfDay.map(minutesToTime).join(", ")
			: "",
		month:
			agent?.configurations.month != null
				? String(agent.configurations.month)
				: "",
	});
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);
	const requestError = createAgent.error ?? updateAgent.error;

	useEffect(() => {
		if (!agent) return;
		setAttachments(attachmentsFromAgent(agent));
		setSchedule({
			days: [...agent.configurations.dayOfWeek],
			times: agent.configurations.timeOfDay.map(minutesToTime).join(", "),
			month:
				agent.configurations.month != null
					? String(agent.configurations.month)
					: "",
		});
	}, [agent]);

	const form = useForm({
		defaultValues: {
			name: agent?.title ?? "",
			instructions: agent?.system_prompt ?? "",
		},
		onSubmit: async ({ value }) => {
			if (!onSaved) return;
			const problems: Record<string, string> = {};
			const drafts: Array<{
				id?: string;
				allowedTools: string[];
				create?: ReturnType<typeof buildConnectorBody>["body"];
			}> = [];
			const seen = new Set<string>();
			const byId = new Map(
				(connectors.data ?? []).map((item) => [item.id, item]),
			);

			attachments.forEach((attachment, index) => {
				const tools = parseAllowedTools(attachment.allowedTools);
				if (attachment.mode === "create") {
					const built = buildConnectorBody(
						attachment.createType,
						attachment.http,
						attachment.mcp,
						attachment.database,
					);
					Object.assign(problems, prefixErrors(built.errors, index));
					if (attachment.createType === "mcp" && tools.length === 0) {
						problems[`attachments.${index}.allowedTools`] =
							"MCP connectors need at least one allowed tool";
					}
					if (attachment.createType !== "mcp" && tools.length > 0) {
						problems[`attachments.${index}.allowedTools`] =
							"allowedTools applies only to MCP connectors";
					}
					drafts.push({ allowedTools: tools, create: built.body });
					return;
				}
				if (!attachment.connectorId) {
					problems[`attachments.${index}.connectorId`] = "Choose a connector";
					return;
				}
				if (seen.has(attachment.connectorId)) {
					problems[`attachments.${index}.connectorId`] =
						"Each connector can be attached once";
					return;
				}
				seen.add(attachment.connectorId);
				const connector = byId.get(attachment.connectorId);
				if (connector?.type === "mcp" && tools.length === 0) {
					problems[`attachments.${index}.allowedTools`] =
						"MCP connectors need at least one allowed tool";
				}
				if (connector && connector.type !== "mcp" && tools.length > 0) {
					problems[`attachments.${index}.allowedTools`] =
						"allowedTools applies only to MCP connectors";
				}
				drafts.push({ id: attachment.connectorId, allowedTools: tools });
			});

			const times = parseScheduleTimes(schedule.times);
			if (times.error) problems["schedule.times"] = times.error;

			const input: AgentInput = {
				agentTitle: value.name.trim(),
				systemPrompt: value.instructions.trim(),
				configurations: {
					primitives: {},
					...(schedule.month ? { month: Number(schedule.month) } : {}),
					dayOfWeek: [...schedule.days].sort((a, b) => a - b),
					timeOfDay: times.timeOfDay,
				},
			};
			const parsedBasics = agentInputSchema
				.pick({ agentTitle: true, systemPrompt: true })
				.safeParse({
					agentTitle: input.agentTitle,
					systemPrompt: input.systemPrompt,
				});
			if (!parsedBasics.success) {
				for (const issue of parsedBasics.error.issues) {
					if (!problems.form) problems.form = issue.message;
				}
			}

			setErrors(problems);
			if (Object.keys(problems).length > 0) return;

			setSaving(true);
			try {
				const primitives: AgentInput["configurations"]["primitives"] = {};
				let createdAny = false;
				for (const [index, draft] of drafts.entries()) {
					let id = draft.id;
					if (!id && draft.create) {
						const created = await createConnectorRecord(draft.create);
						id = created.id;
						createdAny = true;
					}
					if (!id) {
						setErrors({
							[`attachments.${index}.form`]: "Could not create this connector",
						});
						return;
					}
					primitives[id] =
						draft.allowedTools.length > 0
							? { allowedTools: draft.allowedTools }
							: {};
				}
				if (createdAny) {
					void queryClient.invalidateQueries({
						queryKey: queryKeys.connectors,
					});
				}
				input.configurations.primitives = primitives;
				const parsed = agentInputSchema.safeParse(input);
				if (!parsed.success) {
					setErrors({
						form: parsed.error.issues[0]?.message ?? "Check the form",
					});
					return;
				}
				const onError = (error: Error) => {
					if (error instanceof ApiError && error.fields) {
						setErrors({ ...error.fields, form: error.message });
					}
				};
				if (agent) {
					updateAgent.mutate(
						{ id: agent.id, ...parsed.data },
						{
							onSuccess: (saved) => {
								notify.success("Changes saved", { description: saved.title });
								onSaved(saved);
							},
							onError,
						},
					);
					return;
				}
				createAgent.mutate(parsed.data, {
					onSuccess: (saved) => {
						notify.success("Agent created", { description: saved.title });
						onSaved(saved);
					},
					onError,
				});
			} catch (error) {
				if (error instanceof ApiError && error.fields) {
					setErrors({ ...error.fields, form: error.message });
				} else if (error instanceof Error) {
					setErrors({ form: error.message });
				}
			} finally {
				setSaving(false);
			}
		},
	});

	const available = (connectors.data ?? []).filter(
		(item) =>
			!attachments.some((attachment) => attachment.connectorId === item.id),
	);
	const pending = saving || createAgent.isPending || updateAgent.isPending;
	const reduceMotion = useReducedMotion();

	const toolsField = (
		attachment: Attachment,
		idPrefix: string,
		error: string | undefined,
	) => (
		<div className="space-y-1.5">
			<Label htmlFor={`${idPrefix}-tools`}>
				Allowed tools (comma separated)
			</Label>
			<Input
				id={`${idPrefix}-tools`}
				placeholder="search_issues, get_issue"
				className="font-mono text-xs"
				value={attachment.allowedTools}
				onChange={(event) =>
					setAttachments((previous) =>
						patchAttachment(previous, attachment.key, {
							allowedTools: event.target.value,
						}),
					)
				}
				aria-invalid={Boolean(error)}
			/>
			{error ? <p className="text-sm text-destructive">{error}</p> : null}
		</div>
	);

	return (
		<form
			noValidate
			className="max-w-3xl space-y-6"
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<Section
				title="General"
				description="What the agent is called and what it should do."
				contentClassName="space-y-4"
			>
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
								rows={6}
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
			</Section>

			<Section
				title="Connectors"
				description="Create HTTP, MCP, or database tools here, or attach ones you already saved. MCP connectors need an allowlist of tools this agent may call."
				contentClassName="space-y-4"
			>
				<AnimatePresence initial={false}>
					{attachments.map((attachment, index) => {
						const connector = (connectors.data ?? []).find(
							(item) => item.id === attachment.connectorId,
						);
						const fieldErrors = errorsForIndex(errors, index);
						const idPrefix = `attachment-${attachment.key}`;
						return (
							<motion.div
								key={attachment.key}
								initial={reduceMotion ? false : { opacity: 0, y: -4 }}
								animate={{ opacity: 1, y: 0 }}
								exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
								transition={transitionBase}
							>
								<fieldset className="space-y-4 rounded-lg border bg-background p-4">
									<legend className="sr-only">Connector {index + 1}</legend>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div className="flex items-center gap-3">
											<span className="text-sm font-medium" aria-hidden="true">
												Connector {index + 1}
											</span>
											<div className="inline-flex rounded-md border bg-muted p-0.5">
												{(
													[
														["create", "Create new"],
														["library", "Use existing"],
													] as const
												).map(([mode, label]) => (
													<button
														key={mode}
														type="button"
														aria-pressed={attachment.mode === mode}
														className={cn(
															"cursor-pointer rounded-[5px] px-2.5 py-1 text-xs font-medium text-muted-foreground transition-[color,background-color,box-shadow] duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
															attachment.mode === mode &&
																"bg-background text-foreground shadow-xs",
														)}
														onClick={() =>
															setAttachments((previous) =>
																patchAttachment(
																	previous,
																	attachment.key,
																	mode === "create"
																		? { mode, connectorId: "" }
																		: { mode },
																),
															)
														}
													>
														{label}
													</button>
												))}
											</div>
										</div>
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											aria-label={`Remove connector ${index + 1}`}
											className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
											onClick={() =>
												setAttachments((previous) =>
													previous.filter(
														(item) => item.key !== attachment.key,
													),
												)
											}
										>
											<Trash2Icon aria-hidden="true" />
										</Button>
									</div>

									{attachment.mode === "create" ? (
										<div className="space-y-4">
											<ConnectorTypePicker
												value={attachment.createType}
												onChange={(createType) =>
													setAttachments((previous) =>
														patchAttachment(previous, attachment.key, {
															createType,
														}),
													)
												}
												catalog={catalog.data}
												name={`${idPrefix}-type`}
												idPrefix={idPrefix}
											/>
											<ConnectorDraftFields
												type={attachment.createType}
												http={attachment.http}
												mcp={attachment.mcp}
												database={attachment.database}
												onHttp={(http) =>
													setAttachments((previous) =>
														patchAttachment(previous, attachment.key, { http }),
													)
												}
												onMcp={(mcp) =>
													setAttachments((previous) =>
														patchAttachment(previous, attachment.key, { mcp }),
													)
												}
												onDatabase={(database) =>
													setAttachments((previous) =>
														patchAttachment(previous, attachment.key, {
															database,
														}),
													)
												}
												errors={fieldErrors}
												idPrefix={idPrefix}
											/>
											{attachment.createType === "mcp"
												? toolsField(
														attachment,
														idPrefix,
														fieldErrors.allowedTools,
													)
												: null}
										</div>
									) : (
										<div className="space-y-4">
											<div className="space-y-1.5">
												<Label htmlFor={idPrefix}>Connector</Label>
												<Select
													value={attachment.connectorId}
													onValueChange={(connectorId) =>
														setAttachments((previous) =>
															patchAttachment(previous, attachment.key, {
																connectorId,
															}),
														)
													}
												>
													<SelectTrigger
														id={idPrefix}
														className="w-full"
														aria-invalid={Boolean(fieldErrors.connectorId)}
													>
														<SelectValue placeholder="Choose a connector" />
													</SelectTrigger>
													<SelectContent>
														{connector ? (
															<SelectItem value={connector.id}>
																{connector.name} (
																{connectorLabel(connector.type)})
															</SelectItem>
														) : null}
														{available.map((item) => (
															<SelectItem key={item.id} value={item.id}>
																{item.name} ({connectorLabel(item.type)})
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												{fieldErrors.connectorId ? (
													<p className="text-sm text-destructive">
														{fieldErrors.connectorId}
													</p>
												) : null}
											</div>
											{connector ? (
												<p className="text-sm text-muted-foreground">
													<ToneBadge
														tone={
															connector.type === "http" ? "neutral" : "info"
														}
													>
														{connectorLabel(connector.type)}
													</ToneBadge>
												</p>
											) : null}
											{connector?.type === "mcp"
												? toolsField(
														attachment,
														idPrefix,
														fieldErrors.allowedTools,
													)
												: null}
										</div>
									)}
									{fieldErrors.form ? (
										<p className="text-sm text-destructive">
											{fieldErrors.form}
										</p>
									) : null}
								</fieldset>
							</motion.div>
						);
					})}
				</AnimatePresence>
				{attachments.length === 0 ? (
					<p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
						No connectors yet. The agent can still run with instructions only.
					</p>
				) : null}
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() =>
							setAttachments((previous) => [
								...previous,
								emptyAttachment("create"),
							])
						}
					>
						<PlusIcon aria-hidden="true" />
						Create connector
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() =>
							setAttachments((previous) => [
								...previous,
								emptyAttachment("library"),
							])
						}
					>
						<LinkIcon aria-hidden="true" />
						Attach connector
					</Button>
				</div>
			</Section>

			<Section
				title="Schedule"
				description="Optional. Leave empty to run only on demand."
			>
				<ScheduleFields
					value={schedule}
					onChange={setSchedule}
					errors={{
						days: errors["schedule.days"],
						times: errors["schedule.times"],
						month: errors["schedule.month"],
					}}
				/>
			</Section>

			<div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 border-t bg-background/85 px-1 py-4 backdrop-blur-sm">
				<div className="mr-auto min-w-0">
					{errors.form ? (
						<p role="alert" className="text-sm text-destructive">
							{errors.form}
						</p>
					) : null}
					{requestError &&
					!(requestError instanceof ApiError && requestError.fields) ? (
						<p role="alert" className="text-sm text-destructive">
							{requestError.message}
						</p>
					) : null}
				</div>
				<Button type="submit" disabled={pending}>
					{pending ? (
						<Loader2Icon className="animate-spin" aria-hidden="true" />
					) : null}
					{pending
						? agent
							? "Saving…"
							: "Creating…"
						: agent
							? "Save changes"
							: "Create agent"}
				</Button>
			</div>
		</form>
	);
}
