const dateTime = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeStyle: "short",
});

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	["year", 365 * 24 * 60 * 60],
	["month", 30 * 24 * 60 * 60],
	["week", 7 * 24 * 60 * 60],
	["day", 24 * 60 * 60],
	["hour", 60 * 60],
	["minute", 60],
];

export function formatDateTime(iso: string | null | undefined): string {
	if (!iso) return "";
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : dateTime.format(date);
}

// "3 minutes ago", "yesterday"; anything under a minute reads "just now".
export function formatRelativeTime(
	iso: string | null | undefined,
	now: number = Date.now(),
): string {
	if (!iso) return "";
	const time = new Date(iso).getTime();
	if (Number.isNaN(time)) return iso;
	const seconds = Math.round((time - now) / 1000);
	for (const [unit, size] of RELATIVE_UNITS) {
		if (Math.abs(seconds) >= size) {
			return relative.format(Math.trunc(seconds / size), unit);
		}
	}
	return "just now";
}

export function formatDuration(
	startIso: string | null,
	endIso: string | null,
): string {
	if (!startIso || !endIso) return "";
	const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
	if (!Number.isFinite(ms) || ms < 0) return "";
	if (ms < 1000) return `${ms} ms`;
	return `${(ms / 1000).toFixed(1)} s`;
}
