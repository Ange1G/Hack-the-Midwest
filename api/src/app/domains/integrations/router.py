from fastapi import APIRouter, Body, Depends, status

from app.api.deps import get_current_user, get_integration_service, get_secret_cipher
from app.common.envelope import ApiEnvelope, ApiMetadata
from app.core.auth import CurrentUser
from app.core.request_context import request_id_ctx
from app.core.secrets import SecretCipher
from app.domains.connectors.schemas import ConnectorRead
from app.domains.integrations.schemas import (
    AgentTemplateRead,
    IntegrationInstall,
    IntegrationRead,
)
from app.domains.integrations.service import (
    IntegrationService,
    list_agent_templates,
    list_integrations,
)

router = APIRouter()
templates_router = APIRouter()


@router.get("")
async def get_integrations(
    _caller: CurrentUser = Depends(get_current_user),
) -> ApiEnvelope[list[IntegrationRead]]:
    """Platform-maintained integrations users can install as connectors."""
    return ApiEnvelope[list[IntegrationRead]](
        data=list_integrations(),
        error=None,
        metadata=ApiMetadata(request_id=request_id_ctx.get()),
        pagination=None,
    )


@router.post("/{user_sso}/{integration_id}/install", status_code=status.HTTP_201_CREATED)
async def install_integration(
    user_sso: str,
    integration_id: str,
    body: IntegrationInstall | None = Body(default=None),
    service: IntegrationService = Depends(get_integration_service),
    caller: CurrentUser = Depends(get_current_user),
    cipher: SecretCipher | None = Depends(get_secret_cipher),
) -> ApiEnvelope[ConnectorRead]:
    connector = await service.install(
        user_sso,
        integration_id,
        body or IntegrationInstall(),
        caller=caller,
        cipher=cipher,
    )
    return ApiEnvelope[ConnectorRead](
        data=connector,
        error=None,
        metadata=ApiMetadata(request_id=request_id_ctx.get()),
        pagination=None,
    )


@templates_router.get("")
async def get_agent_templates(
    _caller: CurrentUser = Depends(get_current_user),
) -> ApiEnvelope[list[AgentTemplateRead]]:
    """Starting points for agents built on catalog integrations."""
    return ApiEnvelope[list[AgentTemplateRead]](
        data=list_agent_templates(),
        error=None,
        metadata=ApiMetadata(request_id=request_id_ctx.get()),
        pagination=None,
    )
