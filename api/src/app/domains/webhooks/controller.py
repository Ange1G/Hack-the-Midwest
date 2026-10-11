import uuid

from fastapi import Request

from app.common.envelope import ApiEnvelope, ApiMetadata, Pagination
from app.common.pagination import total_pages as compute_total_pages
from app.core.auth import CurrentUser
from app.core.config import Settings
from app.core.exceptions import AppError
from app.core.request_context import request_id_ctx
from app.core.secrets import SecretCipher
from app.domains.executions.schemas import ExecutionRead
from app.domains.webhooks.schemas import WebhookCreate, WebhookRead
from app.domains.webhooks.service import WebhookService


class WebhooksController:
    def __init__(self, service: WebhookService, settings: Settings) -> None:
        self._service = service
        self._settings = settings

    def _item(self, webhook: WebhookRead) -> ApiEnvelope[WebhookRead]:
        return ApiEnvelope[WebhookRead](
            data=webhook,
            error=None,
            metadata=ApiMetadata(request_id=request_id_ctx.get()),
            pagination=None,
        )

    async def create(
        self,
        user_sso: str,
        body: WebhookCreate,
        *,
        caller: CurrentUser,
        cipher: SecretCipher | None,
    ) -> ApiEnvelope[WebhookRead]:
        webhook = await self._service.create(user_sso, body, caller=caller, cipher=cipher)
        return self._item(webhook)

    async def list_by_user_sso(
        self,
        user_sso: str,
        *,
        page: int,
        page_size: int,
        caller: CurrentUser,
    ) -> ApiEnvelope[list[WebhookRead]]:
        items, total_items, resolved_page, resolved_page_size = await self._service.list_for_owner(
            user_sso,
            page=page,
            page_size=page_size,
            caller=caller,
            settings=self._settings,
        )
        return ApiEnvelope[list[WebhookRead]](
            data=items,
            error=None,
            metadata=ApiMetadata(request_id=request_id_ctx.get()),
            pagination=Pagination(
                page=resolved_page,
                page_size=resolved_page_size,
                total_items=total_items,
                total_pages=compute_total_pages(total_items, resolved_page_size),
            ),
        )

    async def delete(
        self,
        user_sso: str,
        webhook_id: uuid.UUID,
        *,
        caller: CurrentUser,
    ) -> None:
        await self._service.delete(user_sso, webhook_id, caller=caller)

    async def fire(
        self,
        webhook_id: uuid.UUID,
        request: Request,
        *,
        signature_header: str | None,
        cipher: SecretCipher | None,
    ) -> ApiEnvelope[ExecutionRead]:
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                declared = int(content_length)
            except ValueError:
                declared = 0
            if declared > self._settings.webhook_max_body_bytes:
                raise AppError(
                    code="payload_too_large",
                    message="Webhook body exceeds maximum size",
                    status_code=413,
                )
        raw_body = await request.body()
        if len(raw_body) > self._settings.webhook_max_body_bytes:
            raise AppError(
                code="payload_too_large",
                message="Webhook body exceeds maximum size",
                status_code=413,
            )
        execution = await self._service.fire(
            webhook_id,
            raw_body=raw_body,
            signature_header=signature_header,
            settings=self._settings,
            cipher=cipher,
        )
        return ApiEnvelope[ExecutionRead](
            data=execution,
            error=None,
            metadata=ApiMetadata(request_id=request_id_ctx.get()),
            pagination=None,
        )
