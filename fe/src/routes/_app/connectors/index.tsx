import { createFileRoute, Link } from "@tanstack/react-router";
import { ConnectorList } from "#/components/connectors/connector-list";
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
				description="HTTP, MCP, and database tools you can attach to agents."
				action={
					<Button asChild>
						<Link to="/connectors/new" className={buttonLinkClass}>
							New connector
						</Link>
					</Button>
				}
			/>
			<ConnectorList />
		</>
	);
}
