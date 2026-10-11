import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { AgentForm } from "#/components/agents/agent-form";
import { PageHeader } from "#/components/layout/page";
import { backLinkClass } from "#/lib/styles";

export const Route = createFileRoute("/_app/agents/new")({
	component: NewAgentPage,
});

function NewAgentPage() {
	const navigate = useNavigate();
	return (
		<>
			<PageHeader
				title="New agent"
				description="Describe what the agent should do and add the HTTP, MCP, or database tools it may use."
				eyebrow={
					<Link to="/agents" className={backLinkClass}>
						<ArrowLeftIcon className="size-3.5" aria-hidden="true" />
						Agents
					</Link>
				}
			/>
			<AgentForm
				onSaved={(agent) =>
					navigate({ to: "/agents/$agentId", params: { agentId: agent.id } })
				}
			/>
		</>
	);
}
