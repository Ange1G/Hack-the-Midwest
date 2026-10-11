import { createFileRoute, Link } from "@tanstack/react-router";
import { AgentList } from "#/components/agents/agent-list";
import { PageHeader } from "#/components/layout/page";
import { Button } from "#/components/ui/button";
import { buttonLinkClass } from "#/lib/styles";

export const Route = createFileRoute("/_app/agents/")({
	component: AgentsPage,
});

function AgentsPage() {
	return (
		<>
			<PageHeader
				title="Agents"
				description="Agents you have built from the platform's tools."
				action={
					<Button asChild>
						<Link to="/agents/new" className={buttonLinkClass}>
							New agent
						</Link>
					</Button>
				}
			/>
			<AgentList />
		</>
	);
}
