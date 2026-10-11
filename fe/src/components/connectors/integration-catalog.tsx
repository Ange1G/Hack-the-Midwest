import { Link } from "@tanstack/react-router";
import {
	CheckIcon,
	ExternalLinkIcon,
	Loader2Icon,
	SparklesIcon,
} from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { ListSection } from "#/components/list/list-section";
import { FieldError } from "#/components/schedule/field-error";
import { ErrorState } from "#/components/states";
import { ToneBadge } from "#/components/tone-badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "#/components/ui/sheet";
import { Skeleton } from "#/components/ui/skeleton";
import { ApiError } from "#/lib/api/client";
import {
	useConnectors,
	useInstallIntegration,
	useIntegrations,
} from "#/lib/api/queries";
import {
	connectorLabel,
	type Integration,
	integrationInstallSchema,
} from "#/lib/api/schemas";
import { notify } from "#/lib/feedback";
import { installedConnectors } from "#/lib/integrations";

const externalLinkClass =
	"inline-flex items-center gap-1 rounded-sm text-xs font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring";

// Platform-maintained integrations: one API key and they become connectors.
export function IntegrationCatalog() {
	const integrations = useIntegrations();
	const connectors = useConnectors();
	const [installing, setInstalling] = useState<Integration | null>(null);

	return (
		<ListSection
			title="Integrations"
			description="Ready-made connectors for search, scraping, and extraction. Bring your own API key."
		>
			{integrations.isPending ? (
				<ul className="grid gap-3 md:grid-cols-3" aria-hidden="true">
					{[0, 1, 2].map((item) => (
						<li key={item}>
							<Skeleton className="h-40 rounded-lg" />
						</li>
					))}
				</ul>
			) : integrations.isError ? (
				<ErrorState
					title="Could not load integrations"
					error={integrations.error}
					onRetry={() => void integrations.refetch()}
				/>
			) : (
				<ul className="grid gap-3 md:grid-cols-3">
					{integrations.data.map((integration) => {
						const installed = installedConnectors(
							integration,
							connectors.data ?? [],
						);
						return (
							<li key={integration.id}>
								<IntegrationCard
									integration={integration}
									installedId={installed[0]?.id}
									onInstall={() => setInstalling(integration)}
								/>
							</li>
						);
					})}
				</ul>
			)}
			<InstallSheet
				integration={installing}
				onClose={() => setInstalling(null)}
			/>
		</ListSection>
	);
}

function IntegrationCard({
	integration,
	installedId,
	onInstall,
}: {
	integration: Integration;
	installedId: string | undefined;
	onInstall: () => void;
}) {
	return (
		<article className="flex h-full flex-col gap-3 rounded-lg border bg-card p-4">
			<header className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<h3 className="text-sm font-medium">{integration.name}</h3>
					<p className="text-xs text-muted-foreground">
						{integration.vendor} · {connectorLabel(integration.connector_type)}
					</p>
				</div>
				<ToneBadge tone="neutral" className="shrink-0">
					{integration.category}
				</ToneBadge>
			</header>
			<p className="text-sm text-muted-foreground">{integration.description}</p>
			<p className="text-xs text-muted-foreground">
				{integration.tools.length > 0
					? `${integration.tools.length} tools`
					: "Agent-set fields only"}{" "}
				· API key {integration.api_key_required ? "required" : "optional"}
			</p>
			<footer className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
				{installedId ? (
					<Link
						to="/connectors/$connectorId"
						params={{ connectorId: installedId }}
						className={externalLinkClass}
					>
						<CheckIcon className="size-3.5 text-success" aria-hidden="true" />
						Installed
					</Link>
				) : (
					<a
						href={integration.docs_url}
						target="_blank"
						rel="noopener noreferrer"
						className={externalLinkClass}
					>
						Docs
						<ExternalLinkIcon className="size-3" aria-hidden="true" />
						<span className="sr-only">(opens in a new tab)</span>
					</a>
				)}
				<Button
					type="button"
					size="sm"
					variant={installedId ? "outline" : "default"}
					onClick={onInstall}
					aria-label={`${installedId ? "Install another" : "Install"} ${integration.name}`}
				>
					{installedId ? "Install another" : "Install"}
				</Button>
			</footer>
		</article>
	);
}

function InstallSheet({
	integration,
	onClose,
}: {
	integration: Integration | null;
	onClose: () => void;
}) {
	return (
		<Sheet
			open={integration !== null}
			onOpenChange={(open) => !open && onClose()}
		>
			<SheetContent className="w-full sm:max-w-md">
				{integration ? (
					<InstallForm
						// Fresh form state for each integration.
						key={integration.id}
						integration={integration}
						onDone={onClose}
					/>
				) : null}
			</SheetContent>
		</Sheet>
	);
}

function InstallForm({
	integration,
	onDone,
}: {
	integration: Integration;
	onDone: () => void;
}) {
	const install = useInstallIntegration();
	const [apiKey, setApiKey] = useState("");
	const [name, setName] = useState("");
	const [errors, setErrors] = useState<Record<string, string>>({});
	const id = useId();

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (integration.api_key_required && !apiKey.trim()) {
			setErrors({ apiKey: `${integration.vendor} needs an API key` });
			return;
		}
		const parsed = integrationInstallSchema.safeParse({
			apiKey: apiKey.trim() || undefined,
			name: name.trim() || undefined,
		});
		if (!parsed.success) {
			const next: Record<string, string> = {};
			for (const issue of parsed.error.issues) {
				next[String(issue.path[0] ?? "form")] ??= issue.message;
			}
			setErrors(next);
			return;
		}
		setErrors({});
		install.mutate(
			{ integrationId: integration.id, ...parsed.data },
			{
				onSuccess: (connector) => {
					notify.success(`${integration.name} installed`, {
						description: `Connector ${connector.name} is ready to attach to agents.`,
					});
					onDone();
				},
				onError: (error) => {
					if (error instanceof ApiError && error.fields) {
						setErrors(error.fields);
						return;
					}
					setErrors({
						form: error instanceof Error ? error.message : "Could not install",
					});
				},
			},
		);
	};

	return (
		<form noValidate onSubmit={submit} className="flex h-full flex-col">
			<SheetHeader className="border-b">
				<SheetTitle className="flex items-center gap-2">
					<SparklesIcon className="size-4" aria-hidden="true" />
					Install {integration.name}
				</SheetTitle>
				<SheetDescription>{integration.description}</SheetDescription>
			</SheetHeader>
			<div className="flex-1 space-y-5 overflow-y-auto p-4">
				<div className="space-y-1.5">
					<Label htmlFor={`${id}-key`}>
						API key{integration.api_key_required ? "" : " (optional)"}
					</Label>
					<Input
						id={`${id}-key`}
						type="password"
						autoComplete="off"
						spellCheck={false}
						value={apiKey}
						onChange={(event) => setApiKey(event.target.value)}
						aria-invalid={Boolean(errors.apiKey)}
						aria-describedby={`${id}-key-hint`}
					/>
					<p id={`${id}-key-hint`} className="text-xs text-muted-foreground">
						Stored encrypted and never shown again.{" "}
						<a
							href={integration.api_key_url}
							target="_blank"
							rel="noopener noreferrer"
							className="underline underline-offset-4"
						>
							Get a {integration.vendor} key
							<span className="sr-only"> (opens in a new tab)</span>
						</a>
					</p>
					<FieldError message={errors.apiKey} />
				</div>
				<div className="space-y-1.5">
					<Label htmlFor={`${id}-name`}>Connector name (optional)</Label>
					<Input
						id={`${id}-name`}
						placeholder={integration.connector_name}
						autoCapitalize="off"
						spellCheck={false}
						value={name}
						onChange={(event) => setName(event.target.value)}
						aria-invalid={Boolean(errors.name)}
					/>
					<FieldError message={errors.name} />
				</div>
				{integration.tools.length > 0 ? (
					<div className="space-y-1.5">
						<p className="text-sm font-medium">Tools</p>
						<ul className="flex flex-wrap gap-1.5">
							{integration.tools.map((tool) => (
								<li
									key={tool}
									className="rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-xs"
								>
									{tool}
								</li>
							))}
						</ul>
						<p className="text-xs text-muted-foreground">
							Agents get{" "}
							{integration.default_allowed_tools.length > 0
								? integration.default_allowed_tools.join(", ")
								: "all tools"}{" "}
							by default; change this per agent.
						</p>
					</div>
				) : null}
				{errors.form ? (
					<p role="alert" className="text-sm text-destructive">
						{errors.form}
					</p>
				) : null}
			</div>
			<SheetFooter className="border-t">
				<Button type="submit" disabled={install.isPending}>
					{install.isPending ? (
						<Loader2Icon className="animate-spin" aria-hidden="true" />
					) : null}
					{install.isPending ? "Installing…" : `Install ${integration.name}`}
				</Button>
			</SheetFooter>
		</form>
	);
}
