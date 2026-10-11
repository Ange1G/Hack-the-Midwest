import type { RunStatus } from "#/lib/api/schemas";
import { type Tone, ToneBadge } from "./tone-badge";

const presentation: Record<RunStatus, { label: string; tone: Tone }> = {
	queued: { label: "Queued", tone: "neutral" },
	running: { label: "Running", tone: "info" },
	succeeded: { label: "Succeeded", tone: "success" },
	failed: { label: "Failed", tone: "danger" },
	timed_out: { label: "Timed out", tone: "danger" },
};

export function statusLabel(status: RunStatus): string {
	return presentation[status].label;
}

export function StatusBadge({ status }: { status: RunStatus }) {
	const { label, tone } = presentation[status];
	return <ToneBadge tone={tone}>{label}</ToneBadge>;
}
