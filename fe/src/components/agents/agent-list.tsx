import { Link } from "@tanstack/react-router";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { StatusBadge } from "#/components/status-badge";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { useAgents } from "#/lib/api/queries";
import { formatDateTime } from "#/lib/format";
import { toolKey } from "#/lib/tools";

export function AgentList() {
	const agents = useAgents();

	if (agents.isPending) {
		return <LoadingState label="Loading agents…" />;
	}

	if (agents.isError) {
		return (
			<ErrorState
				title="Could not load agents"
				error={agents.error}
				onRetry={() => void agents.refetch()}
			/>
		);
	}

	if (agents.data.length === 0) {
		return (
			<EmptyState
				title="No agents yet"
				description="Build an agent from the platform's tools and run it in an isolated container."
				action={
					<Button asChild>
						<Link to="/agents/new">Create your first agent</Link>
					</Button>
				}
			/>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Name</TableHead>
					<TableHead>Tools</TableHead>
					<TableHead>Last run</TableHead>
					<TableHead>Created</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{agents.data.map((agent) => (
					<TableRow key={agent.id}>
						<TableCell>
							<div className="flex items-center gap-2">
								<Link
									to="/agents/$agentId"
									params={{ agentId: agent.id }}
									className="font-medium"
								>
									{agent.name}
								</Link>
								{agent.flagged ? (
									<Badge variant="destructive">Flagged</Badge>
								) : null}
							</div>
						</TableCell>
						<TableCell>
							<div className="flex flex-wrap gap-1">
								{agent.tools.map((tool) => (
									<Badge key={toolKey(tool)} variant="outline">
										{tool.kind}
									</Badge>
								))}
							</div>
						</TableCell>
						<TableCell>
							{agent.last_run ? (
								<StatusBadge status={agent.last_run.status} />
							) : (
								<span className="text-sm text-muted-foreground">Never run</span>
							)}
						</TableCell>
						<TableCell className="text-sm text-muted-foreground">
							{formatDateTime(agent.created_at)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
