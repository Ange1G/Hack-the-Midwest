import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import {
	buildConnectorBody,
	buildKnowledgeBody,
	ConnectorDraftFields,
	ConnectorTypePicker,
	emptyDatabaseDraft,
	emptyHttpDraft,
	emptyKnowledgeDraft,
	emptyMcpDraft,
	emptyNotificationDraft,
	KnowledgeFields,
} from "#/components/connectors/connector-fields";
import { Button } from "#/components/ui/button";
import { ApiError } from "#/lib/api/client";
import { useConnectorTypes, useCreateConnector } from "#/lib/api/queries";
import type { Connector, ConnectorType } from "#/lib/api/schemas";
import { notify } from "#/lib/feedback";

const CONNECTOR_TYPES: readonly ConnectorType[] = [
	"http",
	"mcp",
	"database",
	"notification",
	"knowledge",
];

export function ConnectorForm({
	onCreated,
}: {
	onCreated?: (connector: Connector) => void;
}) {
	const catalog = useConnectorTypes();
	const createConnector = useCreateConnector();
	const [type, setType] = useState<ConnectorType>("http");
	const [http, setHttp] = useState(emptyHttpDraft);
	const [mcp, setMcp] = useState(emptyMcpDraft);
	const [database, setDatabase] = useState(emptyDatabaseDraft);
	const [notification, setNotification] = useState(emptyNotificationDraft);
	const [knowledge, setKnowledge] = useState(emptyKnowledgeDraft);
	const [errors, setErrors] = useState<Record<string, string>>({});

	return (
		<form
			noValidate
			className="w-full space-y-6"
			onSubmit={(event) => {
				event.preventDefault();
				const { body, errors: problems } =
					type === "knowledge"
						? buildKnowledgeBody(knowledge)
						: buildConnectorBody(type, http, mcp, database, notification);
				setErrors(problems);
				if (!body || Object.keys(problems).length > 0) return;
				createConnector.mutate(body, {
					onSuccess: (connector) => {
						notify.success("Connector created", {
							description: connector.name,
						});
						onCreated?.(connector);
					},
					onError: (error) => {
						if (error instanceof ApiError && error.fields) {
							setErrors(error.fields);
							return;
						}
						setErrors({
							form: error instanceof Error ? error.message : "Could not save",
						});
					},
				});
			}}
		>
			<ConnectorTypePicker
				value={type}
				onChange={setType}
				catalog={catalog.data}
				name="connector-type"
				idPrefix="connector"
				types={CONNECTOR_TYPES}
			/>

			{type === "knowledge" ? (
				<KnowledgeFields
					value={knowledge}
					onChange={setKnowledge}
					errors={errors}
					idPrefix="connector"
				/>
			) : (
				<ConnectorDraftFields
					type={type}
					http={http}
					mcp={mcp}
					database={database}
					notification={notification}
					onHttp={setHttp}
					onMcp={setMcp}
					onDatabase={setDatabase}
					onNotification={setNotification}
					errors={errors}
					idPrefix="connector"
				/>
			)}

			{errors.form ? (
				<p role="alert" className="text-sm text-destructive">
					{errors.form}
				</p>
			) : null}
			{createConnector.error &&
			!(
				createConnector.error instanceof ApiError &&
				createConnector.error.fields
			) ? (
				<p role="alert" className="text-sm text-destructive">
					{createConnector.error.message}
				</p>
			) : null}

			<div className="flex justify-end border-t pt-6">
				<Button type="submit" disabled={createConnector.isPending}>
					{createConnector.isPending ? (
						<Loader2Icon className="animate-spin" aria-hidden="true" />
					) : null}
					{createConnector.isPending ? "Creating…" : "Create connector"}
				</Button>
			</div>
		</form>
	);
}
