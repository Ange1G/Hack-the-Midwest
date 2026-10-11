import { useNavigate } from "@tanstack/react-router";
import {
	ChevronDownIcon,
	ChevronUpIcon,
	Loader2Icon,
	PlusIcon,
	Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { Section } from "#/components/layout/page";
import { FieldError } from "#/components/schedule/field-error";
import {
	parseScheduleTimes,
	type ScheduleDraft,
	ScheduleFields,
} from "#/components/schedule/schedule-fields";
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
import { ApiError } from "#/lib/api/client";
import { useAgents, useCreateChain } from "#/lib/api/queries";
import { chainCreateSchema } from "#/lib/api/schemas";
import { notify } from "#/lib/feedback";

type StepDraft = { key: number; agentId: string; label: string };

let nextKey = 1;
const emptyStep = (): StepDraft => ({ key: nextKey++, agentId: "", label: "" });

export function ChainForm() {
	const navigate = useNavigate();
	const agents = useAgents();
	const createChain = useCreateChain();
	const [title, setTitle] = useState("");
	const [steps, setSteps] = useState<StepDraft[]>([emptyStep(), emptyStep()]);
	const [schedule, setSchedule] = useState<ScheduleDraft>({
		days: [],
		times: "",
		month: "",
	});
	const [errors, setErrors] = useState<Record<string, string>>({});

	const move = (index: number, delta: number) => {
		const next = index + delta;
		if (next < 0 || next >= steps.length) return;
		setSteps((current) => {
			const copy = [...current];
			const [removed] = copy.splice(index, 1);
			if (!removed) return current;
			copy.splice(next, 0, removed);
			return copy;
		});
	};

	return (
		<form
			className="max-w-3xl space-y-6"
			onSubmit={(event) => {
				event.preventDefault();
				const times = parseScheduleTimes(schedule.times);
				const nextErrors: Record<string, string> = {};
				if (times.error) nextErrors["schedule.times"] = times.error;
				const body = {
					title: title.trim(),
					steps: steps.map((step) => ({
						agent_id: step.agentId,
						...(step.label.trim() ? { label: step.label.trim() } : {}),
					})),
					schedule: {
						dayOfWeek: [...schedule.days].sort((a, b) => a - b),
						timeOfDay: times.timeOfDay,
						...(schedule.month ? { month: Number(schedule.month) } : {}),
					},
				};
				const parsed = chainCreateSchema.safeParse(body);
				if (!parsed.success) {
					for (const issue of parsed.error.issues) {
						const key = issue.path.join(".") || "form";
						if (!(key in nextErrors)) nextErrors[key] = issue.message;
					}
					setErrors(nextErrors);
					return;
				}
				if (Object.keys(nextErrors).length > 0) {
					setErrors(nextErrors);
					return;
				}
				setErrors({});
				const emptySchedule =
					!schedule.month &&
					schedule.days.length === 0 &&
					times.timeOfDay.length === 0;
				createChain.mutate(
					{
						...parsed.data,
						schedule: emptySchedule ? undefined : parsed.data.schedule,
					},
					{
						onSuccess: (chain) => {
							notify.success("Chain created", { description: chain.title });
							void navigate({
								to: "/chains/$chainId",
								params: { chainId: chain.id },
							});
						},
						onError: (error) => {
							if (error instanceof ApiError && error.fields) {
								setErrors(error.fields);
								return;
							}
							setErrors({
								form:
									error instanceof Error
										? error.message
										: "Could not create chain",
							});
						},
					},
				);
			}}
		>
			<Section title="General">
				<div className="space-y-1.5">
					<Label htmlFor="chain-title">Name</Label>
					<Input
						id="chain-title"
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						aria-invalid={Boolean(errors.title)}
					/>
					<FieldError message={errors.title} />
				</div>
			</Section>

			<Section
				title="Steps"
				description="Order is the run order. Each step receives the previous step's output."
				contentClassName="space-y-3"
			>
				<ol className="space-y-3">
					{steps.map((step, index) => (
						<li
							key={step.key}
							className="space-y-3 rounded-lg border bg-card p-4"
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<p className="text-sm font-medium">Step {index + 1}</p>
								<div className="flex gap-1">
									<Button
										type="button"
										variant="outline"
										size="sm"
										aria-label={`Move step ${index + 1} up`}
										disabled={index === 0}
										onClick={() => move(index, -1)}
									>
										<ChevronUpIcon className="size-4" />
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										aria-label={`Move step ${index + 1} down`}
										disabled={index === steps.length - 1}
										onClick={() => move(index, 1)}
									>
										<ChevronDownIcon className="size-4" />
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										aria-label={`Remove step ${index + 1}`}
										disabled={steps.length === 1}
										onClick={() =>
											setSteps((current) =>
												current.filter((_, i) => i !== index),
											)
										}
									>
										<Trash2Icon className="size-4" />
									</Button>
								</div>
							</div>
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="space-y-1.5">
									<Label htmlFor={`step-agent-${step.key}`}>Agent</Label>
									<Select
										value={step.agentId}
										onValueChange={(agentId) =>
											setSteps((current) =>
												current.map((item) =>
													item.key === step.key ? { ...item, agentId } : item,
												),
											)
										}
									>
										<SelectTrigger
											id={`step-agent-${step.key}`}
											className="w-full"
										>
											<SelectValue placeholder="Choose an agent" />
										</SelectTrigger>
										<SelectContent>
											{(agents.data?.items ?? []).map((agent) => (
												<SelectItem key={agent.id} value={agent.id}>
													{agent.title}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FieldError message={errors[`steps.${index}.agent_id`]} />
								</div>
								<div className="space-y-1.5">
									<Label htmlFor={`step-label-${step.key}`}>
										Label (optional)
									</Label>
									<Input
										id={`step-label-${step.key}`}
										value={step.label}
										onChange={(event) =>
											setSteps((current) =>
												current.map((item) =>
													item.key === step.key
														? { ...item, label: event.target.value }
														: item,
												),
											)
										}
									/>
								</div>
							</div>
						</li>
					))}
				</ol>
				<FieldError message={errors.steps} />
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => setSteps((current) => [...current, emptyStep()])}
				>
					<PlusIcon className="size-4" />
					Add step
				</Button>
			</Section>

			<Section
				title="Schedule"
				description="Optional. Leave empty to run only on demand."
			>
				<ScheduleFields
					value={schedule}
					onChange={setSchedule}
					errors={{
						days: errors["schedule.days"] ?? errors["schedule.dayOfWeek"],
						times: errors["schedule.times"] ?? errors["schedule.timeOfDay"],
						month: errors["schedule.month"],
					}}
				/>
			</Section>

			<FieldError message={errors.form} />
			<div className="flex justify-end border-t pt-6">
				<Button type="submit" disabled={createChain.isPending}>
					{createChain.isPending ? (
						<Loader2Icon className="animate-spin" aria-hidden="true" />
					) : null}
					{createChain.isPending ? "Creating…" : "Create chain"}
				</Button>
			</div>
		</form>
	);
}
