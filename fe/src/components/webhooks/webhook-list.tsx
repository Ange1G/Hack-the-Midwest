import { Link } from "@tanstack/react-router";
import { Loader2Icon, PlusIcon, Trash2Icon, WebhookIcon } from "lucide-react";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import {
	DataTableActionButton,
	DataTableActionsCell,
} from "#/components/data-table-action-button";
import { Section } from "#/components/layout/page";
import { Notice } from "#/components/notice";
import { RelativeTime } from "#/components/relative-time";
import { OutputBlock } from "#/components/runs/output-block";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	useAgents,
	useChains,
	useCreateWebhook,
	useDeleteWebhook,
	useWebhooks,
	webhookFireUrl,
} from "#/lib/api/queries";
import type { Webhook } from "#/lib/api/schemas";
import { notify } from "#/lib/feedback";
import { buttonLinkClass, tableLinkClass } from "#/lib/styles";

export function WebhookList() {
	const webhooks = useWebhooks();
	const agents = useAgents();
	const chains = useChains();
	const createWebhook = useCreateWebhook();
	const deleteWebhook = useDeleteWebhook();
	const [targetType, setTargetType] = useState<"agent" | "chain">("agent");
	const [agentId, setAgentId] = useState("");
	const [chainId, setChainId] = useState("");
	const [created, setCreated] = useState<Webhook | null>(null);

	if (webhooks.isPending) {
		return <LoadingState label="Loading webhooks…" />;
	}
	if (webhooks.isError) {
		return (
			<ErrorState
				title="Could not load webhooks"
				error={webhooks.error}
				onRetry={() => void webhooks.refetch()}
			/>
		);
	}

	const agentTitle = (id: string | null | undefined) =>
		id
			? (agents.data?.items.find((agent) => agent.id === id)?.title ?? id)
			: "—";
	const chainTitle = (id: string | null | undefined) =>
		id
			? (chains.data?.items.find((chain) => chain.id === id)?.title ?? id)
			: "—";

	const columns: DataTableColumn<Webhook>[] = [
		{
			id: "target",
			accessorFn: (row) =>
				row.target_type === "chain"
					? chainTitle(row.target_chain_id)
					: agentTitle(row.target_agent_id),
			header: "Target",
			cell: ({ row }) =>
				row.original.target_type === "chain" && row.original.target_chain_id ? (
					<Link
						to="/chains/$chainId"
						params={{ chainId: row.original.target_chain_id }}
						className={tableLinkClass}
					>
						{chainTitle(row.original.target_chain_id)}
					</Link>
				) : row.original.target_agent_id ? (
					<Link
						to="/agents/$agentId"
						params={{ agentId: row.original.target_agent_id }}
						className={tableLinkClass}
					>
						{agentTitle(row.original.target_agent_id)}
					</Link>
				) : (
					"—"
				),
		},
		{
			id: "type",
			accessorFn: (row) => row.target_type,
			header: "Type",
			cell: ({ row }) => (
				<span className="text-sm capitalize text-muted-foreground">
					{row.original.target_type}
				</span>
			),
		},
		{
			id: "secret",
			header: "Secret",
			enableSorting: false,
			cell: ({ row }) => (
				<code className="text-xs text-muted-foreground">
					{row.original.secret}
				</code>
			),
		},
		{
			id: "created",
			accessorFn: (row) => row.created_at,
			header: "Created",
			cell: ({ row }) => (
				<RelativeTime
					iso={row.original.created_at}
					className="text-sm text-muted-foreground"
				/>
			),
		},
		{
			id: "actions",
			header: () => <span className="sr-only">Actions</span>,
			enableSorting: false,
			meta: {
				headerClassName: "w-[80px] text-right",
				cellClassName: "text-right",
			},
			cell: ({ row }) => (
				<DataTableActionsCell>
					<DataTableActionButton
						label="Delete webhook"
						icon={<Trash2Icon className="size-4" />}
						destructive
						pending={
							deleteWebhook.isPending &&
							deleteWebhook.variables === row.original.id
						}
						onClick={() =>
							deleteWebhook.mutate(row.original.id, {
								onSuccess: () => notify.success("Webhook deleted"),
								onError: (error) =>
									notify.error("Could not delete the webhook", error),
							})
						}
					/>
				</DataTableActionsCell>
			),
		},
	];

	const canSubmit =
		targetType === "chain" ? Boolean(chainId) : Boolean(agentId);

	const create = () => {
		if (!canSubmit) return;
		createWebhook.mutate(
			targetType === "chain"
				? { target_type: "chain", target_chain_id: chainId }
				: { target_type: "agent", target_agent_id: agentId },
			{
				onSuccess: (webhook) => {
					setCreated(webhook);
					notify.success("Webhook created", {
						description: "Copy the secret now; it is shown once.",
					});
				},
				onError: (error) => notify.error("Could not create the webhook", error),
			},
		);
	};

	return (
		<div className="space-y-6">
			<Section
				title="New webhook"
				description="A signed public URL that starts a run of the chosen agent or chain."
			>
				<form
					className="flex flex-wrap items-end gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						create();
					}}
				>
					<div className="min-w-40 space-y-1.5">
						<Label htmlFor="webhook-target-type">Target</Label>
						<Select
							value={targetType}
							onValueChange={(value) =>
								setTargetType(value === "chain" ? "chain" : "agent")
							}
						>
							<SelectTrigger
								id="webhook-target-type"
								className="w-full min-w-40"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="agent">Agent</SelectItem>
								<SelectItem value="chain">Chain</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{targetType === "chain" ? (
						<div className="min-w-56 space-y-1.5">
							<Label htmlFor="webhook-chain">Chain</Label>
							<Select value={chainId} onValueChange={setChainId}>
								<SelectTrigger id="webhook-chain" className="w-full min-w-56">
									<SelectValue placeholder="Choose a chain" />
								</SelectTrigger>
								<SelectContent>
									{(chains.data?.items ?? []).map((chain) => (
										<SelectItem key={chain.id} value={chain.id}>
											{chain.title}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					) : (
						<div className="min-w-56 space-y-1.5">
							<Label htmlFor="webhook-agent">Agent</Label>
							<Select value={agentId} onValueChange={setAgentId}>
								<SelectTrigger id="webhook-agent" className="w-full min-w-56">
									<SelectValue placeholder="Choose an agent" />
								</SelectTrigger>
								<SelectContent>
									{(agents.data?.items ?? []).map((agent) => (
										<SelectItem key={agent.id} value={agent.id}>
											{agent.title}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
					<Button
						type="submit"
						disabled={!canSubmit || createWebhook.isPending}
					>
						{createWebhook.isPending ? (
							<Loader2Icon className="animate-spin" aria-hidden="true" />
						) : (
							<PlusIcon aria-hidden="true" />
						)}
						{createWebhook.isPending ? "Creating…" : "Create webhook"}
					</Button>
				</form>
				{createWebhook.error ? (
					<p role="alert" className="mt-3 text-sm text-destructive">
						{createWebhook.error.message}
					</p>
				) : null}
			</Section>

			{created ? (
				<Notice tone="info" title="Copy this secret now">
					<p>
						The HMAC secret is shown once. Integrators POST to the fire URL with{" "}
						<code>X-Webhook-Signature: sha256=&lt;hex&gt;</code> of the raw
						body.
					</p>
					<dl className="mt-3 space-y-3 text-sm">
						<div className="space-y-1">
							<dt className="text-xs font-medium">Fire URL</dt>
							<dd>
								<OutputBlock
									label="Fire URL"
									value={webhookFireUrl(created.id)}
								/>
							</dd>
						</div>
						<div className="space-y-1">
							<dt className="text-xs font-medium">Secret</dt>
							<dd>
								<OutputBlock label="Secret" value={created.secret} />
							</dd>
						</div>
						<div className="space-y-1">
							<dt className="text-xs font-medium">Example</dt>
							<dd>
								<OutputBlock
									label="Example"
									value={`BODY='{"ticket":"INC-1"}'
SIG=$(python -c "import hmac,hashlib,sys; print(hmac.new(sys.argv[1].encode(), sys.argv[2].encode(), hashlib.sha256).hexdigest())" '${created.secret}' "$BODY")
curl -s -X POST '${webhookFireUrl(created.id)}' \\
  -H 'Content-Type: application/json' \\
  -H "X-Webhook-Signature: sha256=$SIG" \\
  -d "$BODY"`}
								/>
							</dd>
						</div>
					</dl>
				</Notice>
			) : null}

			{webhooks.data.items.length === 0 ? (
				<EmptyState
					icon={<WebhookIcon />}
					title="No webhooks yet"
					description="Create one after you have an agent or chain to trigger."
					action={
						<Button asChild>
							<Link to="/agents" className={buttonLinkClass}>
								View agents
							</Link>
						</Button>
					}
				/>
			) : (
				<DataTable
					columns={columns}
					data={webhooks.data.items}
					caption="Your webhooks"
				/>
			)}
		</div>
	);
}
