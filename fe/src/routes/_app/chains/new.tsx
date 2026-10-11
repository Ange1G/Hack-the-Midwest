import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { ChainForm } from "#/components/chains/chain-form";
import { PageHeader } from "#/components/layout/page";
import { backLinkClass } from "#/lib/styles";

export const Route = createFileRoute("/_app/chains/new")({
	component: NewChainPage,
});

function NewChainPage() {
	return (
		<>
			<PageHeader
				title="New chain"
				description="Pick agents in order. Each step receives the previous step's output."
				eyebrow={
					<Link to="/chains" className={backLinkClass}>
						<ArrowLeftIcon className="size-3.5" aria-hidden="true" />
						Chains
					</Link>
				}
			/>
			<ChainForm />
		</>
	);
}
