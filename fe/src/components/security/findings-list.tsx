import { Link } from "@tanstack/react-router";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { Badge } from "#/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { useAgents, useFindings } from "#/lib/api/queries";
import type { Finding } from "#/lib/api/schemas";
import { formatDateTime } from "#/lib/format";

const severityVariant: Record<
	Finding["severity"],
	"default" | "secondary" | "destructive" | "outline"
> = {
	low: "outline",
	medium: "secondary",
	high: "destructive",
	critical: "destructive",
};

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

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

	const agentName = (id: string) =>
		agents.data?.find((agent) => agent.id === id)?.name ?? id;

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Severity</TableHead>
					<TableHead>Rule</TableHead>
					<TableHead>Agent</TableHead>
					<TableHead>Action</TableHead>
					<TableHead>When</TableHead>
					<TableHead />
				</TableRow>
			</TableHeader>
			<TableBody>
				{findings.data.map((finding) => (
					<TableRow key={finding.id}>
						<TableCell>
							<Badge variant={severityVariant[finding.severity]}>
								{capitalize(finding.severity)}
							</Badge>
						</TableCell>
						<TableCell>
							<code>{finding.rule}</code>
							<p className="mt-1 max-w-md text-xs text-muted-foreground">
								{finding.message}
							</p>
						</TableCell>
						<TableCell>
							<Link
								to="/agents/$agentId"
								params={{ agentId: finding.agent_id }}
							>
								{agentName(finding.agent_id)}
							</Link>
						</TableCell>
						<TableCell>
							<Badge
								variant={
									finding.action === "killed" ? "destructive" : "secondary"
								}
							>
								{capitalize(finding.action)}
							</Badge>
						</TableCell>
						<TableCell className="text-sm text-muted-foreground">
							{formatDateTime(finding.created_at)}
						</TableCell>
						<TableCell className="text-right">
							<Link to="/runs/$runId" params={{ runId: finding.run_id }}>
								View run
							</Link>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
