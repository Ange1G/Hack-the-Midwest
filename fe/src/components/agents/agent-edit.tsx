import { Link, useNavigate } from "@tanstack/react-router";
import { AgentForm } from "#/components/agents/agent-form";
import { PageHeader } from "#/components/layout/page";
import { ErrorState, LoadingState } from "#/components/states";
import { useAgent } from "#/lib/api/queries";
import { textLinkClass } from "#/lib/styles";

export function AgentEdit({ agentId }: { agentId: string }) {
	const agent = useAgent(agentId);
	const navigate = useNavigate();

	if (agent.isPending) {
		return <LoadingState label="Loading agent…" />;
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
			<AgentForm
				agent={agent.data}
				onSaved={(updated) =>
					void navigate({
						to: "/agents/$agentId",
						params: { agentId: updated.id },
					})
				}
			/>
		</>
	);
}
