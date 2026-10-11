import type {
	ChainRunStatus,
	ChainRunStepStatus,
	RunStatus,
} from "#/lib/api/schemas";
import { type Tone, ToneBadge } from "./tone-badge";

type PipelineStatus = RunStatus | ChainRunStatus | ChainRunStepStatus;

const presentation: Record<
	PipelineStatus,
	{ label: string; tone: Tone; active?: boolean }
> = {
	queued: { label: "Queued", tone: "neutral", active: true },
	pending: { label: "Pending", tone: "neutral" },
	running: { label: "Running", tone: "info", active: true },
	succeeded: { label: "Succeeded", tone: "success" },
	failed: { label: "Failed", tone: "danger" },
	timed_out: { label: "Timed out", tone: "danger" },
	skipped: { label: "Skipped", tone: "neutral" },
};

export function statusLabel(status: PipelineStatus): string {
	return presentation[status].label;
}

export function StatusBadge({ status }: { status: PipelineStatus }) {
	const { label, tone, active } = presentation[status];
	return (
		<ToneBadge tone={tone} pulse={active}>
			{label}
		</ToneBadge>
	);
}
