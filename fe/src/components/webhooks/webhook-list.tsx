import { Link } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import {
	DataTableActionButton,
	DataTableActionsCell,
} from "#/components/data-table-action-button";
import { Notice } from "#/components/notice";
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
import { formatDateTime } from "#/lib/format";
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
				<span className="capitalize">{row.original.target_type}</span>
			),
		},
		{
			id: "secret",
			header: "Secret",
			enableSorting: false,
			cell: ({ row }) => <code className="text-xs">{row.original.secret}</code>,
		},
		{
			id: "created",
			accessorFn: (row) => row.created_at,
			header: "Created",
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">
					{formatDateTime(row.original.created_at)}
				</span>
			),
		},
		{
			id: "actions",
			header: "Actions",
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
						onClick={() => deleteWebhook.mutate(row.original.id)}
					/>
				</DataTableActionsCell>
			),
		},
	];

	const canSubmit =
		targetType === "chain" ? Boolean(chainId) : Boolean(agentId);

	return (
		<div className="space-y-6">
			<form
				className="island-shell space-y-3 rounded-xl p-4"
				onSubmit={(event) => {
					event.preventDefault();
					if (!canSubmit) return;
					createWebhook.mutate(
						targetType === "chain"
							? { target_type: "chain", target_chain_id: chainId }
							: { target_type: "agent", target_agent_id: agentId },
						{ onSuccess: (webhook) => setCreated(webhook) },
					);
				}}
			>
				<h2 className="text-base font-semibold">New webhook</h2>
				<p className="text-sm text-muted-foreground">
					Creates a signed public URL that starts a run of the chosen agent or
					chain.
				</p>
				<div className="flex flex-wrap items-end gap-3">
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
						{createWebhook.isPending ? "Creating…" : "Create webhook"}
					</Button>
				</div>
				{createWebhook.error ? (
					<p role="alert" className="text-sm text-destructive">
						{createWebhook.error.message}
					</p>
				) : null}
			</form>

			{created ? (
				<Notice tone="info" title="Copy this secret now">
					<p>
						The HMAC secret is shown once. Integrators POST to the fire URL with{" "}
						<code>X-Webhook-Signature: sha256=&lt;hex&gt;</code> of the raw
						body.
					</p>
					<dl className="mt-3 space-y-2 text-sm">
						<div>
							<dt className="text-muted-foreground">Fire URL</dt>
							<dd>
								<code className="break-all">{webhookFireUrl(created.id)}</code>
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Secret</dt>
							<dd>
								<code className="break-all">{created.secret}</code>
							</dd>
						</div>
					</dl>
					<pre className="mt-3 overflow-x-auto rounded-md bg-(--sand) p-2 text-xs">
						{`BODY='{"ticket":"INC-1"}'
SIG=$(python -c "import hmac,hashlib,sys; print(hmac.new(sys.argv[1].encode(), sys.argv[2].encode(), hashlib.sha256).hexdigest())" '${created.secret}' "$BODY")
curl -s -X POST '${webhookFireUrl(created.id)}' \\
  -H 'Content-Type: application/json' \\
  -H "X-Webhook-Signature: sha256=$SIG" \\
  -d "$BODY"`}
					</pre>
				</Notice>
			) : null}

			{webhooks.data.items.length === 0 ? (
				<EmptyState
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
