import uuid

from fastapi import APIRouter, Depends, Header, Query, Request, status

from app.api.deps import get_current_user, get_secret_cipher, get_webhooks_controller
from app.common.envelope import ApiEnvelope
from app.core.auth import CurrentUser
from app.core.config import Settings, get_settings
from app.core.secrets import SecretCipher
from app.domains.executions.schemas import ExecutionRead
from app.domains.webhooks.controller import WebhooksController
from app.domains.webhooks.schemas import WebhookCreate, WebhookRead

router = APIRouter()
fire_router = APIRouter()


@router.get("/{user_sso}")
async def list_webhooks(
    user_sso: str,
    page: int = Query(default=1, ge=1),
    page_size: int | None = Query(default=None, ge=1),
    controller: WebhooksController = Depends(get_webhooks_controller),
    caller: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ApiEnvelope[list[WebhookRead]]:
    return await controller.list_by_user_sso(
        user_sso,
        page=page,
        page_size=page_size or settings.default_page_size,
        caller=caller,
    )


@router.post("/{user_sso}", status_code=status.HTTP_201_CREATED)
async def create_webhook(
    user_sso: str,
    body: WebhookCreate,
    controller: WebhooksController = Depends(get_webhooks_controller),
    caller: CurrentUser = Depends(get_current_user),
    cipher: SecretCipher | None = Depends(get_secret_cipher),
) -> ApiEnvelope[WebhookRead]:
    return await controller.create(user_sso, body, caller=caller, cipher=cipher)


@router.delete("/{user_sso}/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    user_sso: str,
    webhook_id: uuid.UUID,
    controller: WebhooksController = Depends(get_webhooks_controller),
    caller: CurrentUser = Depends(get_current_user),
) -> None:
    await controller.delete(user_sso, webhook_id, caller=caller)


@fire_router.post("/{webhook_id}", status_code=status.HTTP_202_ACCEPTED)
async def fire_webhook(
    webhook_id: uuid.UUID,
    request: Request,
    controller: WebhooksController = Depends(get_webhooks_controller),
    cipher: SecretCipher | None = Depends(get_secret_cipher),
    x_webhook_signature: str | None = Header(default=None, alias="X-Webhook-Signature"),
) -> ApiEnvelope[ExecutionRead]:
    return await controller.fire(
        webhook_id,
        request,
        signature_header=x_webhook_signature,
        cipher=cipher,
    )
