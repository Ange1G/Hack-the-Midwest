import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { ConnectorList } from "#/components/connectors/connector-list";
import { IntegrationCatalog } from "#/components/connectors/integration-catalog";
import { PageHeader } from "#/components/layout/page";
import { Button } from "#/components/ui/button";
import { buttonLinkClass } from "#/lib/styles";

export const Route = createFileRoute("/_app/connectors/")({
	component: ConnectorsPage,
});

function ConnectorsPage() {
	return (
		<>
			<PageHeader
				title="Connectors"
				description="Integrations, HTTP and MCP tools, databases, and knowledge you can attach to agents."
				action={
					<Button asChild>
						<Link to="/connectors/new" className={buttonLinkClass}>
							<PlusIcon aria-hidden="true" />
							New connector
						</Link>
					</Button>
				}
			/>
			<div className="space-y-10">
				<IntegrationCatalog />
				<ConnectorList />
			</div>
		</>
	);
}
