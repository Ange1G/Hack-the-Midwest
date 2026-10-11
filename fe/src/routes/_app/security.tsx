import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "#/components/layout/page";
import { Notice } from "#/components/notice";

export const Route = createFileRoute("/_app/security")({
	component: SecurityPage,
});

function SecurityPage() {
	return (
		<>
			<PageHeader
				title="Security"
				description="Findings from the platform's monitor across all of your agents' runs."
			/>
			<Notice tone="info" title="Security monitoring is not available yet">
				<p>
					The backend does not yet expose findings or policy-violation reports.
					Agent executions still run with deterministic limits (timeouts, SSRF
					blocking, and allowlisted tools). Findings will show up here once
					monitoring ships.
				</p>
			</Notice>
		</>
	);
}
