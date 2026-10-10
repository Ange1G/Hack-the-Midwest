import { createFileRoute } from "@tanstack/react-router";
import { RunView } from "#/components/runs/run-view";

export const Route = createFileRoute("/_app/runs/$runId")({
	component: RunPage,
});

function RunPage() {
	const { runId } = Route.useParams();
	return <RunView runId={runId} />;
}
