import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useState } from "react";
import { AgentForm, type AgentPreset } from "#/components/agents/agent-form";
import { TemplatePicker } from "#/components/agents/template-picker";
import { PageHeader } from "#/components/layout/page";
import { Notice } from "#/components/notice";
import { Button } from "#/components/ui/button";
import type { AgentTemplate } from "#/lib/api/schemas";
import { backLinkClass } from "#/lib/styles";

export const Route = createFileRoute("/_app/agents/new")({
	component: NewAgentPage,
});

function NewAgentPage() {
	const navigate = useNavigate();
	const [started, setStarted] = useState<{
		template: AgentTemplate;
		preset: AgentPreset;
	} | null>(null);

	return (
		<>
			<PageHeader
				title="New agent"
				description="Describe what the agent should do and add the tools it may use, or start from a template."
				eyebrow={
					<Link to="/agents" className={backLinkClass}>
						<ArrowLeftIcon className="size-3.5" aria-hidden="true" />
						Agents
					</Link>
				}
			/>
			<div className="space-y-8">
				{started ? (
					<Notice tone="info" title={`Started from ${started.template.name}`}>
						{started.template.suggested_input ? (
							<p>
								Try it with a run input like:{" "}
								<q className="italic">{started.template.suggested_input}</q>
							</p>
						) : null}
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="mt-2"
							onClick={() => setStarted(null)}
						>
							Start blank instead
						</Button>
					</Notice>
				) : (
					<TemplatePicker
						onSelect={(template, preset) => setStarted({ template, preset })}
					/>
				)}
				<AgentForm
					// Remount so the form picks up the template's starting values.
					key={started?.template.id ?? "blank"}
					preset={started?.preset}
					onSaved={(agent) =>
						navigate({ to: "/agents/$agentId", params: { agentId: agent.id } })
					}
				/>
			</div>
		</>
	);
}
