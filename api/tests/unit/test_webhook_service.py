import uuid
from datetime import UTC, datetime

import pytest

from app.core.auth import CurrentUser
from app.core.config import Settings
from app.core.exceptions import AppError, ForbiddenError, NotFoundError, UnauthorizedError
from app.core.secrets import SecretCipher
from app.domains.agents.models import Agent
from app.domains.executions.models import AgentExecution
from app.domains.executions.schemas import ExecutionCreate
from app.domains.primitives.base import SECRET_PLACEHOLDER
from app.domains.webhooks.models import Webhook
from app.domains.webhooks.rate_limit import SlidingWindowLimiter
from app.domains.webhooks.schemas import WebhookCreate
from app.domains.webhooks.service import WebhookService
from app.domains.webhooks.signature import signature_header

ME = CurrentUser(user_sso="sso-me")
OTHER = CurrentUser(user_sso="sso-other")
AGENT_ID = uuid.uuid4()
SETTINGS = Settings(
    app_env="test",
    max_active_executions_per_owner=5,
    webhook_rate_limit_per_minute=10,
    webhook_max_body_bytes=20_000,
)


def _agent() -> Agent:
    now = datetime.now(UTC)
    return Agent(
        id=AGENT_ID,
        title="Digest",
        system_prompt="Summarize",
        configurations={"primitives": {}},
        owner_user_sso="sso-me",
        created_at=now,
        updated_at=now,
    )


class FakeAgents:
    def __init__(self, agents: list[Agent]) -> None:
        self._agents = agents

    async def get_owned(self, owner_user_sso: str, agent_id: uuid.UUID) -> Agent | None:
        for agent in self._agents:
            if agent.id == agent_id and agent.owner_user_sso == owner_user_sso:
                return agent
        return None


class FakeWebhooks:
    def __init__(self) -> None:
        self.rows: dict[uuid.UUID, Webhook] = {}

    async def create(self, webhook: Webhook) -> Webhook:
        now = datetime.now(UTC)
        webhook.id = uuid.uuid4()
        webhook.created_at = now
        self.rows[webhook.id] = webhook
        return webhook

    async def get_by_id(self, webhook_id: uuid.UUID) -> Webhook | None:
        return self.rows.get(webhook_id)

    async def list_by_owner(
        self, owner_user_sso: str, *, page: int, page_size: int
    ) -> tuple[list[Webhook], int]:
        items = [row for row in self.rows.values() if row.owner_user_sso == owner_user_sso]
        return items, len(items)

    async def delete_owned(self, owner_user_sso: str, webhook_id: uuid.UUID) -> bool:
        row = self.rows.get(webhook_id)
        if row is None or row.owner_user_sso != owner_user_sso:
            return False
        del self.rows[webhook_id]
        return True


class FakeExecutions:
    def __init__(self) -> None:
        self.enqueued: list[tuple[str, uuid.UUID, ExecutionCreate | None]] = []

    async def enqueue(
        self,
        owner_user_sso: str,
        agent_id: uuid.UUID,
        *,
        caller: CurrentUser,
        settings: Settings,
        body: ExecutionCreate | None = None,
    ):
        self.enqueued.append((owner_user_sso, agent_id, body))
        now = datetime.now(UTC)
        execution = AgentExecution(
            id=uuid.uuid4(),
            agent_id=agent_id,
            owner_user_sso=owner_user_sso,
            status="queued",
            input=body.input if body is not None else None,
            result=None,
            error_code=None,
            error_message=None,
            runner_meta=None,
            started_at=None,
            finished_at=None,
            created_at=now,
            updated_at=now,
        )
        from app.domains.executions.schemas import ExecutionRead

        return ExecutionRead.model_validate(execution)


def _service(
    *,
    agents: list[Agent] | None = None,
    limiter: SlidingWindowLimiter | None = None,
) -> tuple[WebhookService, FakeWebhooks, FakeExecutions]:
    webhooks = FakeWebhooks()
    executions = FakeExecutions()
    service = WebhookService(
        webhooks,
        FakeAgents(agents if agents is not None else [_agent()]),
        executions,
        rate_limiter=limiter or SlidingWindowLimiter(),
    )
    return service, webhooks, executions


async def test_create_returns_plaintext_secret_once() -> None:
    service, webhooks, _ = _service()
    cipher = SecretCipher(SecretCipher.generate_key())
    created = await service.create(
        "sso-me",
        WebhookCreate(target_agent_id=AGENT_ID),
        caller=ME,
        cipher=cipher,
    )
    assert created.secret != SECRET_PLACEHOLDER
    assert created.secret
    stored = next(iter(webhooks.rows.values()))
    assert stored.secret_ciphertext != created.secret
    assert cipher.decrypt(stored.secret_ciphertext) == created.secret


async def test_list_masks_secret() -> None:
    service, _, _ = _service()
    cipher = SecretCipher(SecretCipher.generate_key())
    await service.create(
        "sso-me",
        WebhookCreate(target_agent_id=AGENT_ID),
        caller=ME,
        cipher=cipher,
    )
    items, *_ = await service.list_for_owner(
        "sso-me", page=1, page_size=20, caller=ME, settings=SETTINGS
    )
    assert items[0].secret == SECRET_PLACEHOLDER


async def test_create_missing_agent_is_not_found() -> None:
    service, _, _ = _service(agents=[])
    with pytest.raises(NotFoundError):
        await service.create(
            "sso-me",
            WebhookCreate(target_agent_id=AGENT_ID),
            caller=ME,
            cipher=SecretCipher(SecretCipher.generate_key()),
        )


async def test_create_forbidden_for_other_user() -> None:
    service, _, _ = _service()
    with pytest.raises(ForbiddenError):
        await service.create(
            "sso-me",
            WebhookCreate(target_agent_id=AGENT_ID),
            caller=OTHER,
            cipher=SecretCipher(SecretCipher.generate_key()),
        )


async def test_create_without_cipher_is_unavailable() -> None:
    service, _, _ = _service()
    with pytest.raises(AppError) as exc:
        await service.create(
            "sso-me",
            WebhookCreate(target_agent_id=AGENT_ID),
            caller=ME,
            cipher=None,
        )
    assert exc.value.status_code == 503


async def test_fire_enqueues_compact_json_input() -> None:
    service, _, executions = _service()
    cipher = SecretCipher(SecretCipher.generate_key())
    created = await service.create(
        "sso-me",
        WebhookCreate(target_agent_id=AGENT_ID),
        caller=ME,
        cipher=cipher,
    )
    body = b'{\n  "ticket": "INC-1"\n}'
    result = await service.fire(
        created.id,
        raw_body=body,
        signature_header=signature_header(created.secret, body),
        settings=SETTINGS,
        cipher=cipher,
    )
    assert result["status"] == "queued"
    assert executions.enqueued[0][2] is not None
    assert executions.enqueued[0][2].input == '{"ticket":"INC-1"}'


async def test_fire_invalid_signature_does_not_enqueue() -> None:
    service, _, executions = _service()
    cipher = SecretCipher(SecretCipher.generate_key())
    created = await service.create(
        "sso-me",
        WebhookCreate(target_agent_id=AGENT_ID),
        caller=ME,
        cipher=cipher,
    )
    with pytest.raises(UnauthorizedError):
        await service.fire(
            created.id,
            raw_body=b'{"ok":true}',
            signature_header=signature_header("wrong", b'{"ok":true}'),
            settings=SETTINGS,
            cipher=cipher,
        )
    assert executions.enqueued == []


async def test_fire_missing_agent_is_not_found() -> None:
    service, webhooks, executions = _service()
    cipher = SecretCipher(SecretCipher.generate_key())
    created = await service.create(
        "sso-me",
        WebhookCreate(target_agent_id=AGENT_ID),
        caller=ME,
        cipher=cipher,
    )
    service._agents = FakeAgents([])
    stored = webhooks.rows[created.id]
    body = b'{"ok":true}'
    with pytest.raises(NotFoundError):
        await service.fire(
            created.id,
            raw_body=body,
            signature_header=signature_header(
                cipher.decrypt(stored.secret_ciphertext), body
            ),
            settings=SETTINGS,
            cipher=cipher,
        )
    assert executions.enqueued == []


async def test_fire_unknown_webhook_is_not_found() -> None:
    service, _, _ = _service()
    with pytest.raises(NotFoundError):
        await service.fire(
            uuid.uuid4(),
            raw_body=b"{}",
            signature_header="sha256=00",
            settings=SETTINGS,
            cipher=SecretCipher(SecretCipher.generate_key()),
        )


async def test_fire_rate_limit_rejects_without_enqueue() -> None:
    limiter = SlidingWindowLimiter()
    service, _, executions = _service(limiter=limiter)
    cipher = SecretCipher(SecretCipher.generate_key())
    created = await service.create(
        "sso-me",
        WebhookCreate(target_agent_id=AGENT_ID),
        caller=ME,
        cipher=cipher,
    )
    tight = Settings(
        app_env="test",
        max_active_executions_per_owner=5,
        webhook_rate_limit_per_minute=1,
        webhook_max_body_bytes=20_000,
    )
    body = b'{"ok":true}'
    header = signature_header(created.secret, body)
    await service.fire(
        created.id,
        raw_body=body,
        signature_header=header,
        settings=tight,
        cipher=cipher,
    )
    with pytest.raises(AppError) as exc:
        await service.fire(
            created.id,
            raw_body=body,
            signature_header=header,
            settings=tight,
            cipher=cipher,
        )
    assert exc.value.status_code == 429
    assert len(executions.enqueued) == 1


async def test_delete_owned_webhook() -> None:
    service, webhooks, _ = _service()
    cipher = SecretCipher(SecretCipher.generate_key())
    created = await service.create(
        "sso-me",
        WebhookCreate(target_agent_id=AGENT_ID),
        caller=ME,
        cipher=cipher,
    )
    await service.delete("sso-me", created.id, caller=ME)
    assert created.id not in webhooks.rows
