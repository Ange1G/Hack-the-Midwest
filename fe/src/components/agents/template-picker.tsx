import { Link } from "@tanstack/react-router";
import { BrainIcon, CircleAlertIcon } from "lucide-react";
import type { AgentPreset } from "#/components/agents/agent-form";
import { ListSection } from "#/components/list/list-section";
import { ToneBadge } from "#/components/tone-badge";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import {
	useAgentTemplates,
	useConnectors,
	useIntegrations,
} from "#/lib/api/queries";
import type { AgentTemplate, Connector, Integration } from "#/lib/api/schemas";
import { installedConnectors } from "#/lib/integrations";
import { textLinkClass } from "#/lib/styles";

type Resolved = {
	preset: AgentPreset;
	missing: Integration[];
};

/** Attach the newest install of each integration the template uses. */
export function resolveTemplate(
	template: AgentTemplate,
	integrations: Integration[],
	connectors: Connector[],
): Resolved {
	const byId = new Map(integrations.map((item) => [item.id, item]));
	const attachments: AgentPreset["attachments"] = [];
	const missing: Integration[] = [];
	for (const integrationId of template.integrations) {
		const integration = byId.get(integrationId);
		if (!integration) continue;
		const connector = installedConnectors(integration, connectors)[0];
		if (!connector) {
			missing.push(integration);
			continue;
		}
		attachments.push({
			connectorId: connector.id,
			allowedTools:
				integration.connector_type === "mcp"
					? (template.allowed_tools[integrationId] ?? [])
					: [],
		});
	}
	return {
		preset: {
			title: template.title,
			systemPrompt: template.system_prompt,
			memory: template.memory,
			attachments,
		},
		missing,
	};
}

export function TemplatePicker({
	onSelect,
}: {
	onSelect: (template: AgentTemplate, preset: AgentPreset) => void;
}) {
	const templates = useAgentTemplates();
	const integrations = useIntegrations();
	const connectors = useConnectors();

	if (templates.isError || integrations.isError) return null;
	const loading =
		templates.isPending || integrations.isPending || connectors.isPending;

	return (
		<ListSection
			title="Start from a template"
			description="Prefilled instructions and connectors from the integration catalog. Everything stays editable."
		>
			{loading ? (
				<ul className="grid gap-3 md:grid-cols-3" aria-hidden="true">
					{[0, 1, 2].map((item) => (
						<li key={item}>
							<Skeleton className="h-36 rounded-lg" />
						</li>
					))}
				</ul>
			) : (
				<ul className="grid gap-3 md:grid-cols-3">
					{templates.data.map((template) => {
						const { preset, missing } = resolveTemplate(
							template,
							integrations.data,
							connectors.data ?? [],
						);
						return (
							<li key={template.id}>
								<article className="flex h-full flex-col gap-2 rounded-lg border bg-card p-4">
									<header className="flex items-start justify-between gap-2">
										<h3 className="text-sm font-medium">{template.name}</h3>
										{template.memory ? (
											<ToneBadge tone="warning" className="shrink-0">
												<BrainIcon
													className="mr-0.5 inline size-3"
													aria-hidden="true"
												/>
												Memory
											</ToneBadge>
										) : null}
									</header>
									<p className="text-sm text-muted-foreground">
										{template.description}
									</p>
									{missing.length > 0 ? (
										<p className="flex items-start gap-1.5 text-xs text-muted-foreground">
											<CircleAlertIcon
												className="mt-px size-3.5 shrink-0 text-warning"
												aria-hidden="true"
											/>
											<span>
												Needs {missing.map((item) => item.name).join(", ")}.{" "}
												<Link to="/connectors" className={textLinkClass}>
													Install it
												</Link>{" "}
												to attach it automatically.
											</span>
										</p>
									) : null}
									<div className="mt-auto flex justify-end pt-1">
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() => onSelect(template, preset)}
											aria-label={`Use the ${template.name} template`}
										>
											Use template
										</Button>
									</div>
								</article>
							</li>
						);
					})}
				</ul>
			)}
		</ListSection>
	);
}
