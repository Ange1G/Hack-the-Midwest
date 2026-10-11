import { useState } from "react";
import {
	buildConnectorBody,
	ConnectorDraftFields,
	ConnectorTypePicker,
	emptyDatabaseDraft,
	emptyHttpDraft,
	emptyMcpDraft,
} from "#/components/connectors/connector-fields";
import { Button } from "#/components/ui/button";
import { ApiError } from "#/lib/api/client";
import { useConnectorTypes, useCreateConnector } from "#/lib/api/queries";
import type { ConnectorType } from "#/lib/api/schemas";

export function ConnectorForm({ onCreated }: { onCreated?: () => void }) {
	const catalog = useConnectorTypes();
	const createConnector = useCreateConnector();
	const [type, setType] = useState<ConnectorType>("http");
	const [http, setHttp] = useState(emptyHttpDraft);
	const [mcp, setMcp] = useState(emptyMcpDraft);
	const [database, setDatabase] = useState(emptyDatabaseDraft);
	const [errors, setErrors] = useState<Record<string, string>>({});

	return (
		<form
			noValidate
			className="max-w-2xl space-y-6"
			onSubmit={(event) => {
				event.preventDefault();
				const { body, errors: problems } = buildConnectorBody(
					type,
					http,
					mcp,
					database,
				);
				setErrors(problems);
				if (!body || Object.keys(problems).length > 0) return;
				createConnector.mutate(body, {
					onSuccess: () => onCreated?.(),
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
			/>

			<ConnectorDraftFields
				type={type}
				http={http}
				mcp={mcp}
				database={database}
				onHttp={setHttp}
				onMcp={setMcp}
				onDatabase={setDatabase}
				errors={errors}
				idPrefix="connector"
			/>

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

			<Button type="submit" disabled={createConnector.isPending}>
				{createConnector.isPending ? "Creating…" : "Create connector"}
			</Button>
		</form>
	);
}
