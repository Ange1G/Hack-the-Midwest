import { createFileRoute } from "@tanstack/react-router";
import { AgentEdit } from "#/components/agents/agent-edit";

export const Route = createFileRoute("/_app/agents/$agentId_/edit")({
	component: EditAgentPage,
});

function EditAgentPage() {
	const { agentId } = Route.useParams();
	return <AgentEdit agentId={agentId} />;
}
