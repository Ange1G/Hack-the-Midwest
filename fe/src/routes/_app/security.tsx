import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "#/components/layout/page";
import { FindingsList } from "#/components/security/findings-list";

export const Route = createFileRoute("/_app/security")({
	component: SecurityPage,
});

function SecurityPage() {
	return (
		<>
			<PageHeader
				title="Security"
				description="Findings from the platform's monitor across all of your agents' runs."
			/>
			<FindingsList />
		</>
	);
}
