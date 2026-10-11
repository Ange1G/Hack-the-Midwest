import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { z } from "zod";
import { ConnectorForm } from "#/components/connectors/connector-form";
import { PageHeader } from "#/components/layout/page";
import { type ConnectorType, connectorTypeSchema } from "#/lib/api/schemas";
import { backLinkClass } from "#/lib/styles";

const searchSchema = z.object({ type: connectorTypeSchema.optional() });

export const Route = createFileRoute("/_app/connectors/new")({
	validateSearch: (
		search: Record<string, unknown>,
	): { type?: ConnectorType } => {
		const parsed = searchSchema.safeParse(search);
		return parsed.success ? parsed.data : {};
	},
	component: NewConnectorPage,
});

function NewConnectorPage() {
	const navigate = useNavigate();
	const { type } = Route.useSearch();
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
			<ConnectorForm
				initialType={type}
				onCreated={(connector) =>
					connector.type === "knowledge"
						? void navigate({
								to: "/connectors/$connectorId",
								params: { connectorId: connector.id },
							})
						: void navigate({ to: "/connectors" })
				}
			/>
		</>
	);
}
