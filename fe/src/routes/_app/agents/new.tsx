import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AgentForm } from "#/components/agents/agent-form";
import { PageHeader } from "#/components/layout/page";

export const Route = createFileRoute("/_app/agents/new")({
	component: NewAgentPage,
});

function NewAgentPage() {
	const navigate = useNavigate();
	return (
		<>
			<PageHeader
				title="New agent"
				description="Describe what the agent should do and pick the tools it may use."
			/>
			<AgentForm
				onCreated={(agent) =>
					navigate({ to: "/agents/$agentId", params: { agentId: agent.id } })
				}
			/>
		</>
	);
}
