import { FieldError } from "#/components/schedule/field-error";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import {
	type ConnectorCreate,
	type ConnectorType,
	type ConnectorTypeCatalog,
	connectorCreateSchema,
	connectorLabel,
	type HttpMethod,
} from "#/lib/api/schemas";
import { CONTRACT_VERSION } from "#/lib/http-contract";
import { cn } from "#/lib/utils";

export const connectorSelectClass =
	"h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

export type HttpDraft = {
	name: string;
	description: string;
	method: HttpMethod;
	url: string;
	payload: string;
	xApiKey: string;
	authorizationHeader: string;
};

export type McpDraft = {
	name: string;
	description: string;
	url: string;
	xApiKey: string;
	authorizationHeader: string;
};

export type DatabaseDraft = {
	name: string;
	description: string;
	mode: "external" | "provisioned";
	engine: "postgres" | "mysql" | "mongodb" | "redis";
	host: string;
	database: string;
	username: string;
	password: string;
	lifecycle: "agent" | "run";
};

export const emptyHttpDraft = (): HttpDraft => ({
	name: "",
	description: "",
	method: "GET",
	url: "",
	payload: "",
	xApiKey: "",
	authorizationHeader: "",
});

export const emptyMcpDraft = (): McpDraft => ({
	name: "",
	description: "",
	url: "",
	xApiKey: "",
	authorizationHeader: "",
});

export const emptyDatabaseDraft = (): DatabaseDraft => ({
	name: "",
	description: "",
	mode: "external",
	engine: "postgres",
	host: "",
	database: "",
	username: "",
	password: "",
	lifecycle: "agent",
});

function fieldErrorsFromIssues(
	issues: Array<{ path: PropertyKey[]; message: string }>,
): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const issue of issues) {
		const key = issue.path.map(String).join(".") || "form";
		if (!(key in errors)) errors[key] = issue.message;
	}
	return errors;
}

export function buildConnectorBody(
	type: ConnectorType,
	http: HttpDraft,
	mcp: McpDraft,
	database: DatabaseDraft,
): { body?: ConnectorCreate; errors: Record<string, string> } {
	const errors: Record<string, string> = {};
	let candidate: unknown;
	if (type === "http") {
		let payload: unknown;
		if (http.method === "POST" && http.payload.trim()) {
			try {
				payload = JSON.parse(http.payload);
			} catch {
				errors["config.payload"] = "Payload must be valid JSON";
			}
		}
		const credentials: { xApiKey?: string; authorizationHeader?: string } = {};
		if (http.xApiKey) credentials.xApiKey = http.xApiKey;
		if (http.authorizationHeader) {
			credentials.authorizationHeader = http.authorizationHeader;
		}
		candidate = {
			type: "http",
			contractVersion: CONTRACT_VERSION,
			name: http.name.trim(),
			...(http.description.trim()
				? { description: http.description.trim() }
				: {}),
			config: {
				method: http.method,
				URL: http.url.trim(),
				...(payload !== undefined ? { payload } : {}),
			},
			...(Object.keys(credentials).length > 0 ? { credentials } : {}),
		};
	} else if (type === "mcp") {
		const credentials: { xApiKey?: string; authorizationHeader?: string } = {};
		if (mcp.xApiKey) credentials.xApiKey = mcp.xApiKey;
		if (mcp.authorizationHeader) {
			credentials.authorizationHeader = mcp.authorizationHeader;
		}
		candidate = {
			type: "mcp",
			contractVersion: CONTRACT_VERSION,
			name: mcp.name.trim(),
			...(mcp.description.trim()
				? { description: mcp.description.trim() }
				: {}),
			config: { URL: mcp.url.trim() },
			...(Object.keys(credentials).length > 0 ? { credentials } : {}),
		};
	} else {
		candidate = {
			type: "database",
			contractVersion: CONTRACT_VERSION,
			name: database.name.trim(),
			...(database.description.trim()
				? { description: database.description.trim() }
				: {}),
			config:
				database.mode === "external"
					? {
							mode: "external" as const,
							engine: database.engine,
							host: database.host.trim(),
							...(database.database.trim()
								? { database: database.database.trim() }
								: {}),
						}
					: {
							mode: "provisioned" as const,
							engine: database.engine,
							lifecycle: database.lifecycle,
						},
			...(database.mode === "external"
				? {
						credentials: {
							...(database.username.trim()
								? { username: database.username.trim() }
								: {}),
							...(database.password ? { password: database.password } : {}),
						},
					}
				: {}),
		};
	}

	const parsed = connectorCreateSchema.safeParse(candidate);
	if (!parsed.success) {
		return {
			errors: { ...errors, ...fieldErrorsFromIssues(parsed.error.issues) },
		};
	}
	if (Object.keys(errors).length > 0) return { errors };
	return { body: parsed.data, errors };
}

export function ConnectorTypePicker({
	value,
	onChange,
	catalog,
	name,
	idPrefix,
}: {
	value: ConnectorType;
	onChange: (type: ConnectorType) => void;
	catalog?: ConnectorTypeCatalog[];
	name: string;
	idPrefix: string;
}) {
	return (
		<fieldset className="space-y-3">
			<legend className="text-sm font-medium">Connector type</legend>
			<div className="grid gap-3 sm:grid-cols-3">
				{(["http", "mcp", "database"] as const).map((option) => {
					const item = catalog?.find((entry) => entry.type === option);
					const selected = value === option;
					return (
						<label
							key={option}
							className={cn(
								"flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-sm",
								selected ? "border-foreground bg-muted/40" : "border-input",
							)}
						>
							<span className="flex items-center gap-2 font-medium">
								<input
									type="radio"
									name={name}
									id={`${idPrefix}-type-${option}`}
									value={option}
									checked={selected}
									onChange={() => onChange(option)}
								/>
								{item?.name ?? connectorLabel(option)}
							</span>
							{item?.description ? (
								<span className="text-muted-foreground">
									{item.description}
								</span>
							) : null}
						</label>
					);
				})}
			</div>
		</fieldset>
	);
}

export function ConnectorDraftFields({
	type,
	http,
	mcp,
	database,
	onHttp,
	onMcp,
	onDatabase,
	errors,
	idPrefix,
}: {
	type: ConnectorType;
	http: HttpDraft;
	mcp: McpDraft;
	database: DatabaseDraft;
	onHttp: (next: HttpDraft) => void;
	onMcp: (next: McpDraft) => void;
	onDatabase: (next: DatabaseDraft) => void;
	errors: Record<string, string>;
	idPrefix: string;
}) {
	if (type === "http") {
		return (
			<HttpFields
				value={http}
				onChange={onHttp}
				errors={errors}
				idPrefix={idPrefix}
			/>
		);
	}
	if (type === "mcp") {
		return (
			<McpFields
				value={mcp}
				onChange={onMcp}
				errors={errors}
				idPrefix={idPrefix}
			/>
		);
	}
	return (
		<DatabaseFields
			value={database}
			onChange={onDatabase}
			errors={errors}
			idPrefix={idPrefix}
		/>
	);
}

function HttpFields({
	value,
	onChange,
	errors,
	idPrefix,
}: {
	value: HttpDraft;
	onChange: (next: HttpDraft) => void;
	errors: Record<string, string>;
	idPrefix: string;
}) {
	const patch = (partial: Partial<HttpDraft>) =>
		onChange({ ...value, ...partial });
	return (
		<div className="space-y-4">
			<NameFields
				name={value.name}
				description={value.description}
				onName={(name) => patch({ name })}
				onDescription={(description) => patch({ description })}
				errors={errors}
				idPrefix={idPrefix}
			/>
			<div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
				<div className="space-y-1.5">
					<Label htmlFor={`${idPrefix}-url`}>URL</Label>
					<Input
						id={`${idPrefix}-url`}
						type="url"
						placeholder="https://api.github.com/repos/acme/web/issues"
						value={value.url}
						onChange={(event) => patch({ url: event.target.value })}
						aria-invalid={Boolean(errors["config.URL"])}
					/>
					<FieldError message={errors["config.URL"]} />
				</div>
				<div className="space-y-1.5">
					<Label htmlFor={`${idPrefix}-method`}>Method</Label>
					<select
						id={`${idPrefix}-method`}
						className={connectorSelectClass}
						value={value.method}
						onChange={(event) =>
							patch({ method: event.target.value as HttpMethod })
						}
					>
						<option value="GET">GET</option>
						<option value="POST">POST</option>
					</select>
				</div>
			</div>
			{value.method === "POST" ? (
				<div className="space-y-1.5">
					<Label htmlFor={`${idPrefix}-payload`}>Payload (JSON)</Label>
					<Textarea
						id={`${idPrefix}-payload`}
						rows={3}
						placeholder='{"text": "digest ready"}'
						className="font-mono text-xs"
						value={value.payload}
						onChange={(event) => patch({ payload: event.target.value })}
						aria-invalid={Boolean(errors["config.payload"])}
					/>
					<FieldError message={errors["config.payload"]} />
				</div>
			) : null}
			<HeaderCredentials
				xApiKey={value.xApiKey}
				authorizationHeader={value.authorizationHeader}
				onChange={patch}
				errors={errors}
				idPrefix={idPrefix}
			/>
		</div>
	);
}

function McpFields({
	value,
	onChange,
	errors,
	idPrefix,
}: {
	value: McpDraft;
	onChange: (next: McpDraft) => void;
	errors: Record<string, string>;
	idPrefix: string;
}) {
	const patch = (partial: Partial<McpDraft>) =>
		onChange({ ...value, ...partial });
	return (
		<div className="space-y-4">
			<NameFields
				name={value.name}
				description={value.description}
				onName={(name) => patch({ name })}
				onDescription={(description) => patch({ description })}
				errors={errors}
				idPrefix={idPrefix}
			/>
			<div className="space-y-1.5">
				<Label htmlFor={`${idPrefix}-url`}>Server URL</Label>
				<Input
					id={`${idPrefix}-url`}
					type="url"
					placeholder="https://mcp.example.com/mcp"
					value={value.url}
					onChange={(event) => patch({ url: event.target.value })}
					aria-invalid={Boolean(errors["config.URL"])}
				/>
				<FieldError message={errors["config.URL"]} />
			</div>
			<HeaderCredentials
				xApiKey={value.xApiKey}
				authorizationHeader={value.authorizationHeader}
				onChange={patch}
				errors={errors}
				idPrefix={idPrefix}
			/>
		</div>
	);
}

function DatabaseFields({
	value,
	onChange,
	errors,
	idPrefix,
}: {
	value: DatabaseDraft;
	onChange: (next: DatabaseDraft) => void;
	errors: Record<string, string>;
	idPrefix: string;
}) {
	const patch = (partial: Partial<DatabaseDraft>) =>
		onChange({ ...value, ...partial });
	return (
		<div className="space-y-4">
			<NameFields
				name={value.name}
				description={value.description}
				onName={(name) => patch({ name })}
				onDescription={(description) => patch({ description })}
				errors={errors}
				idPrefix={idPrefix}
			/>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-1.5">
					<Label htmlFor={`${idPrefix}-mode`}>Mode</Label>
					<select
						id={`${idPrefix}-mode`}
						className={connectorSelectClass}
						value={value.mode}
						onChange={(event) =>
							patch({ mode: event.target.value as DatabaseDraft["mode"] })
						}
					>
						<option value="external">External</option>
						<option value="provisioned">Provisioned</option>
					</select>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor={`${idPrefix}-engine`}>Engine</Label>
					<select
						id={`${idPrefix}-engine`}
						className={connectorSelectClass}
						value={value.engine}
						onChange={(event) =>
							patch({ engine: event.target.value as DatabaseDraft["engine"] })
						}
					>
						<option value="postgres">PostgreSQL</option>
						<option value="mysql">MySQL</option>
						<option value="mongodb">MongoDB</option>
						<option value="redis">Redis</option>
					</select>
				</div>
			</div>
			{value.mode === "external" ? (
				<>
					<div className="space-y-1.5">
						<Label htmlFor={`${idPrefix}-host`}>Host</Label>
						<Input
							id={`${idPrefix}-host`}
							placeholder="db.example.com"
							value={value.host}
							onChange={(event) => patch({ host: event.target.value })}
							aria-invalid={Boolean(errors["config.host"])}
						/>
						<FieldError message={errors["config.host"]} />
					</div>
					{value.engine !== "redis" ? (
						<div className="space-y-1.5">
							<Label htmlFor={`${idPrefix}-database`}>Database</Label>
							<Input
								id={`${idPrefix}-database`}
								placeholder="orders"
								value={value.database}
								onChange={(event) => patch({ database: event.target.value })}
								aria-invalid={Boolean(errors["config.database"])}
							/>
							<FieldError message={errors["config.database"]} />
						</div>
					) : null}
					<div className="grid gap-4 sm:grid-cols-2">
						{value.engine !== "redis" ? (
							<div className="space-y-1.5">
								<Label htmlFor={`${idPrefix}-username`}>Username</Label>
								<Input
									id={`${idPrefix}-username`}
									value={value.username}
									onChange={(event) => patch({ username: event.target.value })}
									aria-invalid={Boolean(errors["credentials.username"])}
								/>
								<FieldError message={errors["credentials.username"]} />
							</div>
						) : null}
						<div className="space-y-1.5">
							<Label htmlFor={`${idPrefix}-password`}>Password</Label>
							<Input
								id={`${idPrefix}-password`}
								type="password"
								autoComplete="off"
								value={value.password}
								onChange={(event) => patch({ password: event.target.value })}
								aria-invalid={Boolean(errors["credentials.password"])}
							/>
							<FieldError message={errors["credentials.password"]} />
						</div>
					</div>
				</>
			) : (
				<div className="space-y-1.5">
					<Label htmlFor={`${idPrefix}-lifecycle`}>Lifecycle</Label>
					<select
						id={`${idPrefix}-lifecycle`}
						className={connectorSelectClass}
						value={value.lifecycle}
						onChange={(event) =>
							patch({
								lifecycle: event.target.value as DatabaseDraft["lifecycle"],
							})
						}
					>
						<option value="agent">Kept with the agent</option>
						<option value="run">Fresh for every run</option>
					</select>
				</div>
			)}
		</div>
	);
}

function NameFields({
	name,
	description,
	onName,
	onDescription,
	errors,
	idPrefix,
}: {
	name: string;
	description: string;
	onName: (value: string) => void;
	onDescription: (value: string) => void;
	errors: Record<string, string>;
	idPrefix: string;
}) {
	return (
		<>
			<div className="space-y-1.5">
				<Label htmlFor={`${idPrefix}-name`}>Name</Label>
				<Input
					id={`${idPrefix}-name`}
					placeholder="list_issues"
					autoCapitalize="off"
					spellCheck={false}
					value={name}
					onChange={(event) => onName(event.target.value)}
					aria-invalid={Boolean(errors.name)}
				/>
				<FieldError message={errors.name} />
			</div>
			<div className="space-y-1.5">
				<Label htmlFor={`${idPrefix}-description`}>
					Description (optional)
				</Label>
				<Input
					id={`${idPrefix}-description`}
					placeholder="What this connector is for"
					value={description}
					onChange={(event) => onDescription(event.target.value)}
				/>
			</div>
		</>
	);
}

function HeaderCredentials({
	xApiKey,
	authorizationHeader,
	onChange,
	errors,
	idPrefix,
}: {
	xApiKey: string;
	authorizationHeader: string;
	onChange: (partial: {
		xApiKey?: string;
		authorizationHeader?: string;
	}) => void;
	errors: Record<string, string>;
	idPrefix: string;
}) {
	return (
		<div className="grid gap-4 sm:grid-cols-2">
			<div className="space-y-1.5">
				<Label htmlFor={`${idPrefix}-key`}>API key</Label>
				<Input
					id={`${idPrefix}-key`}
					type="password"
					autoComplete="off"
					value={xApiKey}
					onChange={(event) => onChange({ xApiKey: event.target.value })}
					aria-invalid={Boolean(errors["credentials.xApiKey"])}
				/>
				<FieldError message={errors["credentials.xApiKey"]} />
			</div>
			<div className="space-y-1.5">
				<Label htmlFor={`${idPrefix}-auth`}>Authorization header</Label>
				<Input
					id={`${idPrefix}-auth`}
					type="password"
					autoComplete="off"
					placeholder="Bearer …"
					value={authorizationHeader}
					onChange={(event) =>
						onChange({ authorizationHeader: event.target.value })
					}
					aria-invalid={Boolean(errors["credentials.authorizationHeader"])}
				/>
				<FieldError message={errors["credentials.authorizationHeader"]} />
			</div>
		</div>
	);
}
