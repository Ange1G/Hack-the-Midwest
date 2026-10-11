import { Link } from "@tanstack/react-router";
import {
	ArrowLeftIcon,
	FileTextIcon,
	Loader2Icon,
	Trash2Icon,
	UploadIcon,
} from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";
import { PageHeader, Section } from "#/components/layout/page";
import { RelativeTime } from "#/components/relative-time";
import { FieldError } from "#/components/schedule/field-error";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { ToneBadge } from "#/components/tone-badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { ApiError } from "#/lib/api/client";
import {
	useAddKnowledgeDocument,
	useConnectors,
	useDeleteKnowledgeDocument,
	useKnowledgeDocuments,
} from "#/lib/api/queries";
import {
	type Connector,
	connectorConfigRecord,
	connectorLabel,
	type KnowledgeDocument,
	knowledgeDocumentCreateSchema,
	MAX_KNOWLEDGE_DOCUMENTS,
} from "#/lib/api/schemas";
import { notify } from "#/lib/feedback";
import { formatDateTime } from "#/lib/format";
import { backLinkClass } from "#/lib/styles";

const TEXT_FILE_ACCEPT =
	".txt,.md,.markdown,.csv,.json,text/plain,text/markdown";

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	return `${(bytes / 1024).toFixed(1)} KB`;
}

export function ConnectorDetail({ connectorId }: { connectorId: string }) {
	const connectors = useConnectors();

	if (connectors.isPending) {
		return <LoadingState label="Loading connector…" />;
	}
	if (connectors.isError) {
		return (
			<ErrorState
				title="Could not load connector"
				error={connectors.error}
				onRetry={() => void connectors.refetch()}
			/>
		);
	}
	const connector = connectors.data.find((item) => item.id === connectorId);
	const description = connector?.contract.description;
	if (!connector) {
		return (
			<EmptyState
				title="Connector not found"
				description="It may have been deleted."
				action={
					<Button variant="outline" asChild>
						<Link to="/connectors">Back to connectors</Link>
					</Button>
				}
			/>
		);
	}

	return (
		<>
			<PageHeader
				title={connector.name}
				eyebrow={
					<Link to="/connectors" className={backLinkClass}>
						<ArrowLeftIcon className="size-3.5" aria-hidden="true" />
						Connectors
					</Link>
				}
				meta={
					<ToneBadge tone={connector.type === "http" ? "neutral" : "info"}>
						{connectorLabel(connector.type)}
					</ToneBadge>
				}
				description={
					typeof description === "string" && description
						? description
						: `Created ${formatDateTime(connector.created_at)}`
				}
			/>
			{connector.type === "knowledge" ? (
				<KnowledgeDocuments connector={connector} />
			) : (
				<ConnectorConfig connector={connector} />
			)}
		</>
	);
}

// Non-secret configuration only: credentials never reach the browser.
function ConnectorConfig({ connector }: { connector: Connector }) {
	const config = connectorConfigRecord(connector);
	return (
		<Section title="Configuration">
			<pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
				{JSON.stringify(config, null, 2)}
			</pre>
		</Section>
	);
}

function KnowledgeDocuments({ connector }: { connector: Connector }) {
	const documents = useKnowledgeDocuments(connector.id);
	const maxResults = connectorConfigRecord(connector).maxResults;

	return (
		<div className="space-y-4">
			<p className="max-w-2xl text-sm text-muted-foreground">
				Upload documents here, then attach{" "}
				<code className="text-foreground">{connector.name}</code> to an agent
				from its form ("Use existing") so the agent can search and read them.
			</p>
			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
				<Section
					title="Documents"
					description={
						documents.data
							? `${documents.data.length} of ${MAX_KNOWLEDGE_DOCUMENTS} · agents search them with ${connector.name}__search${typeof maxResults === "number" ? `, ${maxResults} results per search` : ""}`
							: undefined
					}
					contentClassName="p-0"
				>
					{documents.isPending ? (
						<div className="p-4">
							<LoadingState label="Loading documents…" />
						</div>
					) : documents.isError ? (
						<div className="p-4">
							<ErrorState
								title="Could not load documents"
								error={documents.error}
								onRetry={() => void documents.refetch()}
							/>
						</div>
					) : documents.data.length === 0 ? (
						<p className="p-4 text-sm text-muted-foreground">
							No documents yet. Add notes, runbooks, or reference text, and
							agents with this connector can search and quote them.
						</p>
					) : (
						<ul className="divide-y">
							{documents.data.map((document) => (
								<DocumentRow
									key={document.id}
									connectorId={connector.id}
									document={document}
								/>
							))}
						</ul>
					)}
				</Section>
				<AddDocumentForm
					connectorId={connector.id}
					full={(documents.data?.length ?? 0) >= MAX_KNOWLEDGE_DOCUMENTS}
				/>
			</div>
		</div>
	);
}

function DocumentRow({
	connectorId,
	document,
}: {
	connectorId: string;
	document: KnowledgeDocument;
}) {
	const remove = useDeleteKnowledgeDocument(connectorId);
	return (
		<li className="flex items-start gap-3 px-4 py-3">
			<FileTextIcon
				className="mt-0.5 size-4 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>
			<div className="min-w-0 flex-1 space-y-1">
				<div className="flex flex-wrap items-baseline gap-x-2">
					<p className="truncate text-sm font-medium">{document.title}</p>
					<span className="text-xs text-muted-foreground tabular-nums">
						{formatBytes(document.size_bytes)} ·{" "}
						<RelativeTime iso={document.created_at} />
					</span>
				</div>
				<p className="line-clamp-2 text-xs text-muted-foreground">
					{document.excerpt}
				</p>
			</div>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label={`Delete ${document.title}`}
				disabled={remove.isPending}
				onClick={() =>
					remove.mutate(document.id, {
						onSuccess: () => notify.success("Document deleted"),
						onError: (error) =>
							notify.error("Could not delete the document", error),
					})
				}
			>
				{remove.isPending ? (
					<Loader2Icon className="animate-spin" aria-hidden="true" />
				) : (
					<Trash2Icon aria-hidden="true" />
				)}
			</Button>
		</li>
	);
}

function AddDocumentForm({
	connectorId,
	full,
}: {
	connectorId: string;
	full: boolean;
}) {
	const add = useAddKnowledgeDocument(connectorId);
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [errors, setErrors] = useState<Record<string, string>>({});
	const fileInput = useRef<HTMLInputElement>(null);
	const id = useId();

	const loadFile = async (file: File) => {
		setBody(await file.text());
		if (!title.trim())
			setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 200));
	};

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const parsed = knowledgeDocumentCreateSchema.safeParse({ title, body });
		if (!parsed.success) {
			const next: Record<string, string> = {};
			for (const issue of parsed.error.issues) {
				const key = String(issue.path[0] ?? "form");
				next[key] ??= issue.message;
			}
			setErrors(next);
			return;
		}
		setErrors({});
		add.mutate(parsed.data, {
			onSuccess: (document) => {
				setTitle("");
				setBody("");
				notify.success("Document added", { description: document.title });
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
	};

	return (
		<Section
			title="Add a document"
			description="Plain text or Markdown, up to 100 KB"
		>
			<form noValidate className="space-y-4" onSubmit={submit}>
				<div className="space-y-1.5">
					<Label htmlFor={`${id}-title`}>Title</Label>
					<Input
						id={`${id}-title`}
						value={title}
						maxLength={200}
						onChange={(event) => setTitle(event.target.value)}
						aria-invalid={Boolean(errors.title)}
						disabled={full}
					/>
					<FieldError message={errors.title} />
				</div>
				<div className="space-y-1.5">
					<div className="flex items-center justify-between gap-2">
						<Label htmlFor={`${id}-body`}>Content</Label>
						<Button
							type="button"
							variant="ghost"
							size="xs"
							disabled={full}
							onClick={() => fileInput.current?.click()}
						>
							<UploadIcon aria-hidden="true" />
							Load file
						</Button>
						<input
							ref={fileInput}
							type="file"
							accept={TEXT_FILE_ACCEPT}
							className="sr-only"
							tabIndex={-1}
							aria-hidden="true"
							onChange={(event) => {
								const file = event.target.files?.[0];
								event.target.value = "";
								if (file) void loadFile(file);
							}}
						/>
					</div>
					<Textarea
						id={`${id}-body`}
						rows={10}
						className="font-mono text-xs"
						value={body}
						onChange={(event) => setBody(event.target.value)}
						aria-invalid={Boolean(errors.body)}
						disabled={full}
					/>
					<FieldError message={errors.body} />
				</div>
				{full ? (
					<p className="text-sm text-muted-foreground">
						This connector holds the maximum of {MAX_KNOWLEDGE_DOCUMENTS}{" "}
						documents. Delete one to add another.
					</p>
				) : null}
				{errors.form ? (
					<p role="alert" className="text-sm text-destructive">
						{errors.form}
					</p>
				) : null}
				<div className="flex justify-end">
					<Button type="submit" size="sm" disabled={full || add.isPending}>
						{add.isPending ? (
							<Loader2Icon className="animate-spin" aria-hidden="true" />
						) : null}
						{add.isPending ? "Adding…" : "Add document"}
					</Button>
				</div>
			</form>
		</Section>
	);
}
