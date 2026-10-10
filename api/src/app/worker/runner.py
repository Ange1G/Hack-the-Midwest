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


@dataclass(frozen=True)
class RunOutcome:
    exit_code: int | None
    timed_out: bool
    runner_meta: dict[str, Any] = field(default_factory=dict)


class ContainerRunner(Protocol):
    async def run(self, request: RunRequest) -> RunOutcome: ...
