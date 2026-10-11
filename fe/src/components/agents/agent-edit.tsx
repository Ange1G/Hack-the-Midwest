import { Link } from "@tanstack/react-router";
import { AgentForm } from "#/components/agents/agent-form";
import { PageHeader } from "#/components/layout/page";
import { Notice } from "#/components/notice";
import { ErrorState, LoadingState } from "#/components/states";
import { useAgent } from "#/lib/api/queries";
import { textLinkClass } from "#/lib/styles";

export function AgentEdit({ agentId }: { agentId: string }) {
	const agent = useAgent(agentId);

	if (agent.isPending) {
		return <LoadingState label="Loading agent…" layout="form" />;
	}
	if (agent.isError) {
		return (
			<ErrorState
				title="Could not load agent"
				error={agent.error}
				onRetry={() => void agent.refetch()}
			/>
		);
	}

	return (
		<>
			<PageHeader
				title="Edit configuration"
				description={agent.data.title}
				action={
					<Link
						to="/agents/$agentId"
						params={{ agentId }}
						className={textLinkClass}
					>
						Back to agent
					</Link>
				}
			/>
			<Notice tone="info" className="mb-6" title="Saving is not available yet">
				<p>
					You can review this agent's current configuration. Changes cannot be
					saved yet.
				</p>
			</Notice>
			<AgentForm agent={agent.data} readOnly />
		</>
	);
}
