import { createFileRoute } from "@tanstack/react-router";
import { ChainRunView } from "#/components/chains/chain-run-view";

export const Route = createFileRoute("/_app/chain-runs/$chainRunId")({
	component: ChainRunPage,
});

function ChainRunPage() {
	const { chainRunId } = Route.useParams();
	return <ChainRunView chainRunId={chainRunId} />;
}
