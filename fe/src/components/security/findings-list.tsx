import { Link } from "@tanstack/react-router";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { type Tone, ToneBadge } from "#/components/tone-badge";
import { useAgents, useFindings } from "#/lib/api/queries";
import type { Finding } from "#/lib/api/schemas";
import { formatDateTime } from "#/lib/format";
import { textLinkClass } from "#/lib/styles";

type FindingRow = Finding & { agent_name: string };

const severityRank: Record<Finding["severity"], number> = {
	low: 0,
	medium: 1,
	high: 2,
	critical: 3,
};

const severityTone: Record<Finding["severity"], Tone> = {
	low: "neutral",
	medium: "warning",
	high: "danger",
	critical: "danger",
};

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

const columns: DataTableColumn<FindingRow>[] = [
	{
		id: "severity",
		accessorFn: (finding) => severityRank[finding.severity],
		header: "Severity",
		cell: ({ row }) => (
			<ToneBadge tone={severityTone[row.original.severity]}>
				{capitalize(row.original.severity)}
			</ToneBadge>
		),
	},
	{
		id: "rule",
		accessorFn: (finding) => finding.rule,
		header: "Rule",
		cell: ({ row }) => (
			<>
				<code>{row.original.rule}</code>
				<p className="mt-1 max-w-md text-xs text-muted-foreground">
					{row.original.message}
				</p>
			</>
		),
	},
	{
		id: "agent",
		accessorFn: (finding) => finding.agent_name,
		header: "Agent",
		cell: ({ row }) => (
			<Link
				to="/agents/$agentId"
				params={{ agentId: row.original.agent_id }}
				className={textLinkClass}
			>
				{row.original.agent_name}
			</Link>
		),
	},
	{
		id: "action",
		accessorFn: (finding) => finding.action,
		header: "Action",
		cell: ({ row }) => (
			<ToneBadge tone={row.original.action === "killed" ? "danger" : "warning"}>
				{capitalize(row.original.action)}
			</ToneBadge>
		),
	},
	{
		id: "created_at",
		accessorFn: (finding) => finding.created_at,
		header: "When",
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{formatDateTime(row.original.created_at)}
			</span>
		),
	},
	{
		id: "actions",
		header: () => <span className="sr-only">Actions</span>,
		enableSorting: false,
		cell: ({ row }) => (
			<Link
				to="/runs/$runId"
				params={{ runId: row.original.run_id }}
				className={textLinkClass}
			>
				View run
			</Link>
		),
	},
];

export function FindingsList() {
	const findings = useFindings();
	const agents = useAgents();

	if (findings.isPending) {
		return <LoadingState label="Loading findings…" />;
	}
	if (findings.isError) {
		return (
			<ErrorState
				title="Could not load findings"
				error={findings.error}
				onRetry={() => void findings.refetch()}
			/>
		);
	}
	if (findings.data.length === 0) {
		return (
			<EmptyState
				title="No findings"
				description="The security monitor has not flagged or terminated any runs."
			/>
		);
	}

	const rows: FindingRow[] = findings.data.map((finding) => ({
		...finding,
		agent_name:
			agents.data?.find((agent) => agent.id === finding.agent_id)?.name ??
			finding.agent_id,
	}));

	return (
		<DataTable
			columns={columns}
			data={rows}
			caption="Security findings"
			initialSorting={[{ id: "severity", desc: true }]}
		/>
	);
}
