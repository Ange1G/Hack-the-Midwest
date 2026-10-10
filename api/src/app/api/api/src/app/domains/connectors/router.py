from typing import Any

from fastapi import APIRouter, Body, Depends, Query, status

from app.api.deps import get_connectors_controller, get_current_user, get_secret_cipher
from app.common.envelope import ApiEnvelope
from app.core.auth import CurrentUser
from app.core.config import Settings, get_settings
from app.core.secrets import SecretCipher
from app.domains.connectors.controller import ConnectorsController
from app.domains.connectors.schemas import ConnectorRead

router = APIRouter()


@router.get("/{user_sso}")
async def list_connectors(
    user_sso: str,
    page: int = Query(default=1, ge=1),
    page_size: int | None = Query(default=None, ge=1),
    controller: ConnectorsController = Depends(get_connectors_controller),
    caller: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ApiEnvelope[list[ConnectorRead]]:
    return await controller.list_by_user_sso(
        user_sso,
        page=page,
        page_size=page_size or settings.default_page_size,
        caller=caller,
    )


@router.post("/{user_sso}", status_code=status.HTTP_201_CREATED)
async def create_connector(
    user_sso: str,
    # Validated by the service against the generic contract (see primitives.registry).
    body: dict[str, Any] = Body(...),
    controller: ConnectorsController = Depends(get_connectors_controller),
    caller: CurrentUser = Depends(get_current_user),
    cipher: SecretCipher | None = Depends(get_secret_cipher),
) -> ApiEnvelope[ConnectorRead]:
    return await controller.create(user_sso, body, caller=caller, cipher=cipher)
