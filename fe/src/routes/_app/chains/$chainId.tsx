import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChainDetail } from "#/components/chains/chain-detail";

export const Route = createFileRoute("/_app/chains/$chainId")({
	component: ChainPage,
});

function ChainPage() {
	const { chainId } = Route.useParams();
	const navigate = useNavigate();
	return (
		<ChainDetail
			chainId={chainId}
			onRunStarted={(run) =>
				navigate({
					to: "/chain-runs/$chainRunId",
					params: { chainRunId: run.id },
				})
			}
		/>
	);
}
