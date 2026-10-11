import type {
	FormErrors,
	ScheduleDraft,
} from "#/components/agents/agent-form-model";
import { FieldError, FormField } from "#/components/form-field";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";

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

// Radix Select items cannot have an empty value, so "any month" (no month in
// the draft) is represented by this sentinel in the control only.
const ANY_MONTH = "any";

export function ScheduleSection({
	schedule,
	errors,
	readOnly,
	onChange,
}: {
	schedule: ScheduleDraft;
	errors: FormErrors;
	readOnly: boolean;
	onChange: (patch: Partial<ScheduleDraft>) => void;
}) {
	return (
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
								checked={schedule.days.includes(day.value)}
								disabled={readOnly}
								onCheckedChange={(checked) =>
									onChange({
										days:
											checked === true
												? [...schedule.days, day.value]
												: schedule.days.filter((value) => value !== day.value),
									})
								}
							/>
							<Label htmlFor={`day-${day.value}`}>{day.label}</Label>
						</div>
					))}
				</div>
				<FieldError message={errors["schedule.days"]} />
			</fieldset>
			<div className="grid gap-4 sm:grid-cols-2">
				<FormField
					id="schedule-times"
					label="Times (HH:MM, comma separated)"
					error={errors["schedule.times"]}
				>
					{(control) => (
						<Input
							{...control}
							placeholder="09:00, 17:30"
							value={schedule.times}
							onChange={(event) => onChange({ times: event.target.value })}
							disabled={readOnly}
						/>
					)}
				</FormField>
				<FormField
					id="schedule-month"
					label="Month"
					error={errors["schedule.month"]}
				>
					{(control) => (
						<Select
							value={schedule.month || ANY_MONTH}
							disabled={readOnly}
							onValueChange={(value) =>
								onChange({ month: value === ANY_MONTH ? "" : value })
							}
						>
							<SelectTrigger {...control} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ANY_MONTH}>Any month</SelectItem>
								{MONTHS.map((label, index) => (
									<SelectItem key={label} value={String(index + 1)}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</FormField>
			</div>
		</section>
	);
}
