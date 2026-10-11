import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { ConnectorForm } from "#/components/connectors/connector-form";
import { PageHeader } from "#/components/layout/page";
import { backLinkClass } from "#/lib/styles";

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
				eyebrow={
					<Link to="/connectors" className={backLinkClass}>
						<ArrowLeftIcon className="size-3.5" aria-hidden="true" />
						Connectors
					</Link>
				}
			/>
			<ConnectorForm onCreated={() => void navigate({ to: "/connectors" })} />
		</>
	);
}
