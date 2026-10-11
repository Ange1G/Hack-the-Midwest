import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AgentDetail } from "#/components/agents/agent-detail";

const searchSchema = z.object({ run: z.string().min(1).optional() });

export const Route = createFileRoute("/_app/agents/$agentId")({
	validateSearch: (search: Record<string, unknown>): { run?: string } => {
		const parsed = searchSchema.safeParse(search);
		return parsed.success ? parsed.data : {};
	},
	component: AgentPage,
});

function AgentPage() {
	const { agentId } = Route.useParams();
	const { run } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	return (
		<AgentDetail
			agentId={agentId}
			runId={run}
			onRunChange={(runId) =>
				void navigate({ search: { run: runId }, replace: true })
			}
		/>
	);
}
