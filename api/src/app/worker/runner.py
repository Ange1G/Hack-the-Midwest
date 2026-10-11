import uuid
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class RunRequest:
    execution_id: uuid.UUID
    agent_id: uuid.UUID
    owner_user_sso: str
    callback_url: str
    callback_token: str
    agent_manifest: dict[str, Any]
    timeout_seconds: int
    image: str
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    http_tools: list[dict[str, Any]] | None = None
    http_credentials: dict[str, dict[str, str]] | None = None
    database_tools: list[dict[str, Any]] | None = None
    database_credentials: dict[str, dict[str, str]] | None = None
    # Absolute path on the **host** to a PEM CA bundle. When set the worker
    # volume-mounts it into every execution container and sets SSL_CERT_FILE so
    # Python/httpx uses it. Required on hosts that perform TLS interception
    # (e.g. Zscaler / Netskope) or that have private CA roots. Leave empty in
    # production environments with standard public-CA chains.
    ssl_ca_bundle: str | None = None


@dataclass(frozen=True)
class RunOutcome:
    exit_code: int | None
    timed_out: bool
    runner_meta: dict[str, Any] = field(default_factory=dict)


class ContainerRunner(Protocol):
    async def run(self, request: RunRequest) -> RunOutcome: ...
