import { createFileRoute } from "@tanstack/react-router";
import { ChainForm } from "#/components/chains/chain-form";
import { PageHeader } from "#/components/layout/page";

export const Route = createFileRoute("/_app/chains/new")({
	component: NewChainPage,
});

function NewChainPage() {
	return (
		<>
			<PageHeader
				title="New chain"
				description="Pick agents in order. Each step receives the previous step's output."
			/>
			<ChainForm />
		</>
	);
}
