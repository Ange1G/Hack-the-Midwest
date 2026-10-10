import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AgentDetail } from "#/components/agents/agent-detail";

export const Route = createFileRoute("/_app/agents/$agentId")({
	component: AgentPage,
});

function AgentPage() {
	const { agentId } = Route.useParams();
	const navigate = useNavigate();
	return (
		<AgentDetail
			agentId={agentId}
			onRunStarted={(run) =>
				navigate({ to: "/runs/$runId", params: { runId: run.id } })
			}
		/>
	);
}
