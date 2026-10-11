import {
	type Connector,
	connectorConfigRecord,
	type Integration,
} from "#/lib/api/schemas";

/**
 * Connectors installed from a catalog integration, newest first. An install
 * is an ordinary connector, so it is recognised by its type and endpoint URL.
 */
export function installedConnectors(
	integration: Integration,
	connectors: Connector[],
): Connector[] {
	return connectors
		.filter(
			(connector) =>
				connector.type === integration.connector_type &&
				connectorConfigRecord(connector).URL === integration.url,
		)
		.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
