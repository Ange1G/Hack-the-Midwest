import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "#/components/layout/page";
import { WebhookList } from "#/components/webhooks/webhook-list";

export const Route = createFileRoute("/_app/webhooks/")({
	component: WebhooksPage,
});

function WebhooksPage() {
	return (
		<>
			<PageHeader
				title="Webhooks"
				description="Signed public URLs that start a run of one of your agents or chains."
			/>
			<WebhookList />
		</>
	);
}
