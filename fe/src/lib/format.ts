const dateTime = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeStyle: "short",
});

export function formatDateTime(iso: string | null | undefined): string {
	if (!iso) return "";
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : dateTime.format(date);
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
