import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { FieldErrors, fieldErrorMessages } from "#/components/form-field";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { ApiError } from "#/lib/api/client";
import { useCreateAgent } from "#/lib/api/queries";
import {
	type Agent,
	type AgentInput,
	agentInputSchema,
	type HttpContractInput,
	type HttpMethod,
} from "#/lib/api/schemas";
import {
	CONTRACT_VERSION,
	MAX_RETRIES,
	MAX_TIMEOUT_MS,
	MIN_TIMEOUT_MS,
	minutesToTime,
	timeToMinutes,
} from "#/lib/http-contract";
import { cn } from "#/lib/utils";

type CallDraft = {
	key: number;
	name: string;
	method: HttpMethod;
	url: string;
	payload: string;
	xApiKey: string;
	authorizationHeader: string;
	retries: string;
	timeout: string;
};

const DAYS = [
	{ value: 1, label: "Mon" },
	{ value: 2, label: "Tue" },
	{ value: 3, label: "Wed" },
	{ value: 4, label: "Thu" },
	{ value: 5, label: "Fri" },
	{ value: 6, label: "Sat" },
	{ value: 0, label: "Sun" },
];

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const selectClass =
	"h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

let nextKey = 1;
const emptyCall = (): CallDraft => ({
	key: nextKey++,
	name: "",
	method: "GET",
	url: "",
	payload: "",
	xApiKey: "",
	authorizationHeader: "",
	retries: "",
	timeout: "",
});

function draftsFromAgent(agent: Agent): {
	name: string;
	instructions: string;
	calls: CallDraft[];
	days: number[];
	times: string;
	month: string;
} {
	return {
		name: agent.title,
		instructions: agent.system_prompt,
		calls: Object.entries(agent.configurations.primitives).map(
			([name, contract]) => ({
				key: nextKey++,
				name,
				method: contract.method,
				url: contract.URL,
				payload:
					contract.payload !== undefined
						? JSON.stringify(contract.payload, null, 2)
						: "",
				xApiKey: contract.xApiKey ?? "",
				authorizationHeader: contract.authorizationHeader ?? "",
				retries:
					contract.options?.retries != null
						? String(contract.options.retries)
						: "",
				timeout:
					contract.options?.timeout != null
						? String(contract.options.timeout)
						: "",
			}),
		),
		days: [...agent.configurations.dayOfWeek],
		times: agent.configurations.timeOfDay.map(minutesToTime).join(", "),
		month:
			agent.configurations.month != null
				? String(agent.configurations.month)
				: "",
	};
}

type Errors = Record<string, string>;

function parseWholeNumber(value: string): number | null | undefined {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	return /^-?\d+$/.test(trimmed) ? Number(trimmed) : null;
}

// Turns the drafts into the team-spec body, collecting problems zod cannot
// see from the raw strings (duplicate names, non-JSON payloads, non-numbers).
function buildInput(
	basics: { name: string; instructions: string },
	calls: CallDraft[],
	schedule: { days: number[]; times: string; month: string },
): { input: AgentInput; errors: Errors } {
	const errors: Errors = {};
	const primitives: Record<string, HttpContractInput> = {};
	const seen = new Set<string>();

	calls.forEach((call, index) => {
		const name = call.name.trim();
		if (!name) errors[`calls.${index}.name`] = "Call name is required";
		else if (seen.has(name))
			errors[`calls.${index}.name`] = "Call names must be unique";
		seen.add(name);

		const contract: HttpContractInput = {
			contractVersion: CONTRACT_VERSION,
			method: call.method,
			URL: call.url.trim(),
		};
		if (call.method === "POST" && call.payload.trim()) {
			try {
				contract.payload = JSON.parse(call.payload);
			} catch {
				errors[`calls.${index}.payload`] = "Payload must be valid JSON";
			}
		}
		if (call.xApiKey) contract.xApiKey = call.xApiKey;
		if (call.authorizationHeader) {
			contract.authorizationHeader = call.authorizationHeader;
		}
		const retries = parseWholeNumber(call.retries);
		const timeout = parseWholeNumber(call.timeout);
		if (retries === null)
			errors[`calls.${index}.retries`] = "Retries must be a whole number";
		if (timeout === null)
			errors[`calls.${index}.timeout`] =
				"Timeout must be a whole number of milliseconds";
		if (retries != null || timeout != null) {
			contract.options = {
				...(retries != null ? { retries } : {}),
				...(timeout != null ? { timeout } : {}),
			};
		}
		primitives[name || `call_${index + 1}`] = contract;
	});

	const timeOfDay: number[] = [];
	for (const part of schedule.times.split(",")) {
		if (!part.trim()) continue;
		const minutes = timeToMinutes(part);
		if (minutes === null) {
			errors["schedule.times"] = "Times must look like 09:00 or 17:30";
		} else {
			timeOfDay.push(minutes);
		}
	}

	const input: AgentInput = {
		agentTitle: basics.name.trim(),
		systemPrompt: basics.instructions.trim(),
		configurations: {
			primitives,
			...(schedule.month ? { month: Number(schedule.month) } : {}),
			dayOfWeek: [...schedule.days].sort((a, b) => a - b),
			timeOfDay: Array.from(new Set(timeOfDay)).sort((a, b) => a - b),
		},
	};

	// Map schema issues back onto the draft that produced them.
	const parsed = agentInputSchema.safeParse(input);
	if (!parsed.success) {
		const names = Object.keys(primitives);
		for (const issue of parsed.error.issues) {
			const key = errorKeyForPath(issue.path.map(String), names);
			if (key && !(key in errors)) errors[key] = issue.message;
		}
	}
	return { input, errors };
}

const contractFieldKeys: Record<string, string> = {
	URL: "url",
	payload: "payload",
	xApiKey: "xApiKey",
	authorizationHeader: "authorizationHeader",
	"options.retries": "retries",
	"options.timeout": "timeout",
};

function errorKeyForPath(path: string[], names: string[]): string | null {
	if (path[0] === "agentTitle") return "form";
	if (path[0] === "systemPrompt") return "form";
	if (path[0] !== "configurations") return "form";
	if (path[1] === "primitives") {
		const index = names.indexOf(path[2] ?? "");
		if (index < 0) return "form";
		const rest = path.slice(3).join(".");
		if (!rest) return `calls.${index}.name`;
		const field = contractFieldKeys[rest];
		return field ? `calls.${index}.${field}` : `calls.${index}.name`;
	}
	if (path[1] === "timeOfDay") return "schedule.times";
	if (path[1] === "dayOfWeek") return "schedule.days";
	if (path[1] === "month") return "schedule.month";
	return "form";
}

function errorsFromServer(
	fields: Record<string, string>,
	names: string[],
): Errors {
	const errors: Errors = {};
	for (const [field, message] of Object.entries(fields)) {
		const key = errorKeyForPath(field.split("."), names) ?? "form";
		if (!(key in errors)) errors[key] = message;
	}
	return errors;
}

function FieldError({ message }: { message: string | undefined }) {
	return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

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
	const initial = agent ? draftsFromAgent(agent) : null;
	const [calls, setCalls] = useState<CallDraft[]>(initial?.calls ?? []);
	const [days, setDays] = useState<number[]>(initial?.days ?? []);
	const [times, setTimes] = useState(initial?.times ?? "");
	const [month, setMonth] = useState(initial?.month ?? "");
	const [errors, setErrors] = useState<Errors>({});

	const updateCall = (key: number, patch: Partial<CallDraft>) =>
		setCalls((previous) =>
			previous.map((call) => (call.key === key ? { ...call, ...patch } : call)),
		);

	const form = useForm({
		defaultValues: {
			name: initial?.name ?? "",
			instructions: initial?.instructions ?? "",
		},
		onSubmit: ({ value }) => {
			if (readOnly || !onCreated) return;
			const { input, errors: problems } = buildInput(value, calls, {
				days,
				times,
				month,
			});
			setErrors(problems);
			if (Object.keys(problems).length > 0) return;
			createAgent.mutate(input, {
				onSuccess: (created) => onCreated(created),
				onError: (error) => {
					if (error instanceof ApiError && error.fields) {
						setErrors(
							errorsFromServer(
								error.fields,
								Object.keys(input.configurations.primitives),
							),
						);
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

			<section className="space-y-3" aria-labelledby="calls-heading">
				<div>
					<h2 id="calls-heading" className="text-base font-semibold">
						HTTP calls
					</h2>
					<p className="text-sm text-muted-foreground">
						Each call is a contract the agent may execute. Credentials are
						encrypted at rest and never shown again. Private and internal
						addresses are refused.
					</p>
				</div>
				{calls.map((call, index) => (
					<fieldset
						key={call.key}
						className="island-shell space-y-4 rounded-xl p-4"
					>
						<legend className="px-1 font-medium">HTTP call {index + 1}</legend>
						{readOnly ? null : (
							<div className="flex justify-end">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() =>
										setCalls((previous) =>
											previous.filter((item) => item.key !== call.key),
										)
									}
								>
									Remove call {index + 1}
								</Button>
							</div>
						)}

						<div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
							<div className="space-y-1.5">
								<Label htmlFor={`call-${call.key}-name`}>Call name</Label>
								<Input
									id={`call-${call.key}-name`}
									placeholder="list_issues"
									autoCapitalize="off"
									spellCheck={false}
									value={call.name}
									onChange={(event) =>
										updateCall(call.key, { name: event.target.value })
									}
									disabled={readOnly}
									aria-invalid={Boolean(errors[`calls.${index}.name`])}
								/>
								<FieldError message={errors[`calls.${index}.name`]} />
							</div>
							<div className="space-y-1.5">
								<Label htmlFor={`call-${call.key}-method`}>Method</Label>
								<select
									id={`call-${call.key}-method`}
									className={selectClass}
									value={call.method}
									disabled={readOnly}
									onChange={(event) =>
										updateCall(call.key, {
											method: event.target.value as HttpMethod,
										})
									}
								>
									<option value="GET">GET</option>
									<option value="POST">POST</option>
								</select>
							</div>
						</div>

						<div className="space-y-1.5">
							<Label htmlFor={`call-${call.key}-url`}>URL</Label>
							<Input
								id={`call-${call.key}-url`}
								type="url"
								placeholder="https://api.github.com/repos/acme/web/issues"
								value={call.url}
								onChange={(event) =>
									updateCall(call.key, { url: event.target.value })
								}
								disabled={readOnly}
								aria-invalid={Boolean(errors[`calls.${index}.url`])}
							/>
							<FieldError message={errors[`calls.${index}.url`]} />
						</div>

						{call.method === "POST" ? (
							<div className="space-y-1.5">
								<Label htmlFor={`call-${call.key}-payload`}>
									Payload (JSON)
								</Label>
								<Textarea
									id={`call-${call.key}-payload`}
									rows={3}
									placeholder='{"text": "digest ready"}'
									className="font-mono text-xs"
									value={call.payload}
									onChange={(event) =>
										updateCall(call.key, { payload: event.target.value })
									}
									disabled={readOnly}
									aria-invalid={Boolean(errors[`calls.${index}.payload`])}
								/>
								<FieldError message={errors[`calls.${index}.payload`]} />
							</div>
						) : null}

						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-1.5">
								<Label htmlFor={`call-${call.key}-key`}>API key</Label>
								<Input
									id={`call-${call.key}-key`}
									type="password"
									autoComplete="off"
									value={call.xApiKey}
									onChange={(event) =>
										updateCall(call.key, { xApiKey: event.target.value })
									}
									disabled={readOnly}
									aria-invalid={Boolean(errors[`calls.${index}.xApiKey`])}
								/>
								<FieldError message={errors[`calls.${index}.xApiKey`]} />
							</div>
							<div className="space-y-1.5">
								<Label htmlFor={`call-${call.key}-auth`}>
									Authorization header
								</Label>
								<Input
									id={`call-${call.key}-auth`}
									type="password"
									autoComplete="off"
									placeholder="Bearer …"
									value={call.authorizationHeader}
									onChange={(event) =>
										updateCall(call.key, {
											authorizationHeader: event.target.value,
										})
									}
									disabled={readOnly}
									aria-invalid={Boolean(
										errors[`calls.${index}.authorizationHeader`],
									)}
								/>
								<FieldError
									message={errors[`calls.${index}.authorizationHeader`]}
								/>
							</div>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-1.5">
								<Label htmlFor={`call-${call.key}-retries`}>Retries</Label>
								<Input
									id={`call-${call.key}-retries`}
									type="number"
									inputMode="numeric"
									min={0}
									max={MAX_RETRIES}
									placeholder={`0 to ${MAX_RETRIES}`}
									value={call.retries}
									onChange={(event) =>
										updateCall(call.key, { retries: event.target.value })
									}
									disabled={readOnly}
									aria-invalid={Boolean(errors[`calls.${index}.retries`])}
								/>
								<FieldError message={errors[`calls.${index}.retries`]} />
							</div>
							<div className="space-y-1.5">
								<Label htmlFor={`call-${call.key}-timeout`}>Timeout (ms)</Label>
								<Input
									id={`call-${call.key}-timeout`}
									type="number"
									inputMode="numeric"
									min={MIN_TIMEOUT_MS}
									max={MAX_TIMEOUT_MS}
									placeholder={`${MIN_TIMEOUT_MS} to ${MAX_TIMEOUT_MS}`}
									value={call.timeout}
									onChange={(event) =>
										updateCall(call.key, { timeout: event.target.value })
									}
									disabled={readOnly}
									aria-invalid={Boolean(errors[`calls.${index}.timeout`])}
								/>
								<FieldError message={errors[`calls.${index}.timeout`]} />
							</div>
						</div>
					</fieldset>
				))}
				{readOnly ? null : (
					<Button
						type="button"
						variant="outline"
						onClick={() => setCalls((previous) => [...previous, emptyCall()])}
					>
						Add HTTP call
					</Button>
				)}
			</section>

			<section className="space-y-3" aria-labelledby="schedule-heading">
				<div>
					<h2 id="schedule-heading" className="text-base font-semibold">
						Schedule
					</h2>
					<p className="text-sm text-muted-foreground">
						Optional. Leave everything empty to run the agent only on demand.
					</p>
				</div>
				<fieldset className="space-y-2">
					<legend className="text-sm font-medium">Run on</legend>
					<div className="flex flex-wrap gap-4">
						{DAYS.map((day) => (
							<div key={day.value} className="flex items-center gap-2">
								<Checkbox
									id={`day-${day.value}`}
									checked={days.includes(day.value)}
									disabled={readOnly}
									onCheckedChange={(checked) =>
										setDays((previous) =>
											checked === true
												? [...previous, day.value]
												: previous.filter((value) => value !== day.value),
										)
									}
								/>
								<Label htmlFor={`day-${day.value}`}>{day.label}</Label>
							</div>
						))}
					</div>
					<FieldError message={errors["schedule.days"]} />
				</fieldset>
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-1.5">
						<Label htmlFor="schedule-times">
							Times (HH:MM, comma separated)
						</Label>
						<Input
							id="schedule-times"
							placeholder="09:00, 17:30"
							value={times}
							onChange={(event) => setTimes(event.target.value)}
							disabled={readOnly}
							aria-invalid={Boolean(errors["schedule.times"])}
						/>
						<FieldError message={errors["schedule.times"]} />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="schedule-month">Month</Label>
						<select
							id="schedule-month"
							className={cn(selectClass)}
							value={month}
							disabled={readOnly}
							onChange={(event) => setMonth(event.target.value)}
						>
							<option value="">Any month</option>
							{MONTHS.map((label, index) => (
								<option key={label} value={index + 1}>
									{label}
								</option>
							))}
						</select>
						<FieldError message={errors["schedule.month"]} />
					</div>
				</div>
			</section>

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
