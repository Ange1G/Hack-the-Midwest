import { createFileRoute, Link } from "@tanstack/react-router";
import { ChainList } from "#/components/chains/chain-list";
import { PageHeader } from "#/components/layout/page";
import { Button } from "#/components/ui/button";
import { buttonLinkClass } from "#/lib/styles";

export const Route = createFileRoute("/_app/chains/")({
	component: ChainsPage,
});

function ChainsPage() {
	return (
		<>
			<PageHeader
				title="Chains"
				description="Ordered pipelines of agents. The last step's output is the result."
				action={
					<Button asChild>
						<Link to="/chains/new" className={buttonLinkClass}>
							New chain
						</Link>
					</Button>
				}
			/>
			<ChainList />
		</>
	);
}
