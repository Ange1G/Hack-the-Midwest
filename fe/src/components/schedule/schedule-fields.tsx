import { FieldError } from "#/components/schedule/field-error";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { timeToMinutes } from "#/lib/http-contract";
import { cn } from "#/lib/utils";

export const SCHEDULE_DAYS = [
	{ value: 1, label: "Mon" },
	{ value: 2, label: "Tue" },
	{ value: 3, label: "Wed" },
	{ value: 4, label: "Thu" },
	{ value: 5, label: "Fri" },
	{ value: 6, label: "Sat" },
	{ value: 0, label: "Sun" },
];

export const SCHEDULE_MONTHS = [
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

export type ScheduleDraft = {
	days: number[];
	times: string;
	month: string;
};

export function parseScheduleTimes(times: string): {
	timeOfDay: number[];
	error?: string;
} {
	const timeOfDay: number[] = [];
	for (const part of times.split(",")) {
		if (!part.trim()) continue;
		const minutes = timeToMinutes(part);
		if (minutes === null) {
			return { timeOfDay, error: "Times must look like 09:00 or 17:30" };
		}
		timeOfDay.push(minutes);
	}
	return { timeOfDay: Array.from(new Set(timeOfDay)).sort((a, b) => a - b) };
}

export function ScheduleFields({
	value,
	onChange,
	errors,
	idPrefix = "schedule",
}: {
	value: ScheduleDraft;
	onChange: (next: ScheduleDraft) => void;
	errors?: { days?: string; times?: string; month?: string };
	idPrefix?: string;
}) {
	return (
		<div className="space-y-4">
			<fieldset className="space-y-2">
				<legend className="text-sm font-medium">Run on</legend>
				<div className="flex flex-wrap gap-4">
					{SCHEDULE_DAYS.map((day) => (
						<div key={day.value} className="flex items-center gap-2">
							<Checkbox
								id={`${idPrefix}-day-${day.value}`}
								checked={value.days.includes(day.value)}
								onCheckedChange={(checked) =>
									onChange({
										...value,
										days:
											checked === true
												? [...value.days, day.value]
												: value.days.filter((item) => item !== day.value),
									})
								}
							/>
							<Label htmlFor={`${idPrefix}-day-${day.value}`}>
								{day.label}
							</Label>
						</div>
					))}
				</div>
				<FieldError message={errors?.days} />
			</fieldset>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-1.5">
					<Label htmlFor={`${idPrefix}-times`}>
						Times (HH:MM, comma separated)
					</Label>
					<Input
						id={`${idPrefix}-times`}
						placeholder="09:00, 17:30"
						value={value.times}
						onChange={(event) =>
							onChange({ ...value, times: event.target.value })
						}
						aria-invalid={Boolean(errors?.times)}
					/>
					<FieldError message={errors?.times} />
				</div>
				<div className="space-y-1.5">
					<Label htmlFor={`${idPrefix}-month`}>Month</Label>
					<select
						id={`${idPrefix}-month`}
						className={cn(selectClass)}
						value={value.month}
						onChange={(event) =>
							onChange({ ...value, month: event.target.value })
						}
					>
						<option value="">Any month</option>
						{SCHEDULE_MONTHS.map((label, index) => (
							<option key={label} value={index + 1}>
								{label}
							</option>
						))}
					</select>
					<FieldError message={errors?.month} />
				</div>
			</div>
		</div>
	);
}
