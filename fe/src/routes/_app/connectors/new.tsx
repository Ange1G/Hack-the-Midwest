import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ConnectorForm } from "#/components/connectors/connector-form";
import { PageHeader } from "#/components/layout/page";
import { textLinkClass } from "#/lib/styles";

export const Route = createFileRoute("/_app/connectors/new")({
	component: NewConnectorPage,
});

function NewConnectorPage() {
	const navigate = useNavigate();
	return (
		<>
			<PageHeader
				title="New connector"
				description="Create a reusable tool, then attach it to one or more agents."
				action={
					<Link to="/connectors" className={textLinkClass}>
						Back to connectors
					</Link>
				}
			/>
			<ConnectorForm onCreated={() => void navigate({ to: "/connectors" })} />
		</>
	);
}
