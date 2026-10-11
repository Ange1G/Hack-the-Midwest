import secrets
import uuid

from app.common.pagination import clamp_page_size
from app.core.auth import CurrentUser, ensure_caller_owns
from app.core.config import Settings
from app.core.exceptions import AppError, NotFoundError, UnauthorizedError
from app.core.secrets import SecretCipher
from app.domains.agents.repository import AgentRepository
from app.domains.executions.schemas import ExecutionCreate, ExecutionRead
from app.domains.executions.service import ExecutionService
from app.domains.primitives.base import SECRET_PLACEHOLDER
from app.domains.webhooks.models import Webhook
from app.domains.webhooks.payload import PayloadTooLargeError, body_to_input
from app.domains.webhooks.rate_limit import SlidingWindowLimiter
from app.domains.webhooks.repository import WebhookRepository
from app.domains.webhooks.schemas import WebhookCreate, WebhookRead
from app.domains.webhooks.signature import signature_matches


class WebhookService:
    def __init__(
        self,
        webhooks: WebhookRepository,
        agents: AgentRepository,
        executions: ExecutionService,
        *,
        rate_limiter: SlidingWindowLimiter,
    ) -> None:
        self._webhooks = webhooks
        self._agents = agents
        self._executions = executions
        self._rate_limiter = rate_limiter

    async def create(
        self,
        owner_user_sso: str,
        body: WebhookCreate,
        *,
        caller: CurrentUser,
        cipher: SecretCipher | None,
    ) -> WebhookRead:
        ensure_caller_owns(owner_user_sso, caller)
        if cipher is None:
            raise AppError(
                code="secret_storage_unavailable",
                message="Credential storage is not configured on this server",
                status_code=503,
            )
        agent = await self._agents.get_owned(owner_user_sso, body.target_agent_id)
        if agent is None:
            raise NotFoundError("Agent not found")
        plaintext = secrets.token_urlsafe(32)
        created = await self._webhooks.create(
            Webhook(
                owner_user_sso=caller.user_sso,
                target_agent_id=agent.id,
                secret_ciphertext=cipher.encrypt(plaintext),
                disabled=False,
            )
        )
        return self._to_read(created, secret=plaintext)

    async def list_for_owner(
        self,
        owner_user_sso: str,
        *,
        page: int,
        page_size: int,
        caller: CurrentUser,
        settings: Settings,
    ) -> tuple[list[WebhookRead], int, int, int]:
        ensure_caller_owns(owner_user_sso, caller)
        bounded_page_size = clamp_page_size(page_size, settings.max_page_size)
        rows, total_items = await self._webhooks.list_by_owner(
            owner_user_sso, page=page, page_size=bounded_page_size
        )
        items = [self._to_read(row, secret=SECRET_PLACEHOLDER) for row in rows]
        return items, total_items, page, bounded_page_size

    async def delete(
        self,
        owner_user_sso: str,
        webhook_id: uuid.UUID,
        *,
        caller: CurrentUser,
    ) -> None:
        ensure_caller_owns(owner_user_sso, caller)
        deleted = await self._webhooks.delete_owned(owner_user_sso, webhook_id)
        if not deleted:
            raise NotFoundError("Webhook not found")

    async def fire(
        self,
        webhook_id: uuid.UUID,
        *,
        raw_body: bytes,
        signature_header: str | None,
        settings: Settings,
        cipher: SecretCipher | None,
    ) -> ExecutionRead:
        webhook = await self._webhooks.get_by_id(webhook_id)
        if webhook is None or webhook.disabled:
            raise NotFoundError("Webhook not found")
        if not self._rate_limiter.allow(
            str(webhook.id), settings.webhook_rate_limit_per_minute
        ):
            raise AppError(
                code="too_many_webhook_fires",
                message=(
                    "Too many webhook requests; "
                    f"limit is {settings.webhook_rate_limit_per_minute} per minute"
                ),
                status_code=429,
            )
        if cipher is None:
            raise AppError(
                code="secret_storage_misconfigured",
                message="Credential storage is misconfigured on this server",
                status_code=500,
            )
        try:
            secret = cipher.decrypt(webhook.secret_ciphertext)
        except ValueError:
            raise AppError(
                code="secret_storage_misconfigured",
                message="Credential storage is misconfigured on this server",
                status_code=500,
            ) from None
        if not signature_matches(secret, raw_body, signature_header):
            raise UnauthorizedError("Invalid webhook signature")
        agent = await self._agents.get_owned(
            webhook.owner_user_sso, webhook.target_agent_id
        )
        if agent is None:
            raise NotFoundError("Agent not found")
        try:
            mapped = body_to_input(raw_body)
        except UnicodeDecodeError:
            raise AppError(
                code="invalid_webhook_body",
                message="Webhook body must be valid UTF-8",
                status_code=400,
            ) from None
        except PayloadTooLargeError:
            raise AppError(
                code="payload_too_large",
                message="Webhook body exceeds maximum size",
                status_code=413,
            ) from None
        return await self._executions.enqueue(
            webhook.owner_user_sso,
            webhook.target_agent_id,
            caller=CurrentUser(user_sso=webhook.owner_user_sso),
            settings=settings,
            body=ExecutionCreate(input=mapped),
        )

    def _to_read(self, webhook: Webhook, *, secret: str) -> WebhookRead:
        return WebhookRead(
            id=webhook.id,
            owner_user_sso=webhook.owner_user_sso,
            target_agent_id=webhook.target_agent_id,
            secret=secret,
            disabled=webhook.disabled,
            created_at=webhook.created_at,
        )
