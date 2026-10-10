import { Badge } from "#/components/ui/badge";
import type { RunStatus } from "#/lib/api/schemas";

type Variant = "default" | "secondary" | "destructive" | "outline";

const presentation: Record<RunStatus, { label: string; variant: Variant }> = {
	queued: { label: "Queued", variant: "outline" },
	running: { label: "Running", variant: "secondary" },
	succeeded: { label: "Succeeded", variant: "default" },
	failed: { label: "Failed", variant: "destructive" },
	killed: { label: "Killed", variant: "destructive" },
	cancelled: { label: "Cancelled", variant: "outline" },
};

export function statusLabel(status: RunStatus): string {
	return presentation[status].label;
}

export function StatusBadge({ status }: { status: RunStatus }) {
	const { label, variant } = presentation[status];
	return <Badge variant={variant}>{label}</Badge>;
}
