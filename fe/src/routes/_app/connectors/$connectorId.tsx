import { createFileRoute } from "@tanstack/react-router";
import { ConnectorDetail } from "#/components/connectors/connector-detail";

export const Route = createFileRoute("/_app/connectors/$connectorId")({
	component: ConnectorPage,
});

function ConnectorPage() {
	const { connectorId } = Route.useParams();
	return <ConnectorDetail connectorId={connectorId} />;
}
