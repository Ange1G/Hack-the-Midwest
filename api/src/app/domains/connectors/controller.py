import uuid
from typing import Any

from app.common.envelope import ApiEnvelope, ApiMetadata, Pagination
from app.common.pagination import total_pages
from app.core.auth import CurrentUser
from app.core.config import Settings
from app.core.request_context import request_id_ctx
from app.core.secrets import SecretCipher
from app.domains.connectors.schemas import ConnectorRead, ConnectorToolsRead
from app.domains.connectors.service import ConnectorService
from app.worker.mcp_client import McpToolLister


class ConnectorsController:
    def __init__(self, service: ConnectorService, settings: Settings) -> None:
        self._service = service
        self._settings = settings

    async def list_by_user_sso(
        self, user_sso: str, *, page: int, page_size: int, caller: CurrentUser
    ) -> ApiEnvelope[list[ConnectorRead]]:
        items, total_items, resolved_page, resolved_page_size = (
            await self._service.list_connectors(
                user_sso,
                page=page,
                page_size=page_size,
                caller=caller,
                settings=self._settings,
            )
        )
        return ApiEnvelope[list[ConnectorRead]](
            data=items,
            error=None,
            metadata=ApiMetadata(request_id=request_id_ctx.get()),
            pagination=Pagination(
                page=resolved_page,
                page_size=resolved_page_size,
                total_items=total_items,
                total_pages=total_pages(total_items, resolved_page_size),
            ),
        )

    async def create(
        self,
        user_sso: str,
        body: dict[str, Any],
        *,
        caller: CurrentUser,
        cipher: SecretCipher | None,
    ) -> ApiEnvelope[ConnectorRead]:
        connector = await self._service.create_connector(
            user_sso, body, caller=caller, cipher=cipher
        )
        return ApiEnvelope[ConnectorRead](
            data=connector,
            error=None,
            metadata=ApiMetadata(request_id=request_id_ctx.get()),
            pagination=None,
        )

    async def delete(
        self,
        user_sso: str,
        connector_id: uuid.UUID,
        *,
        caller: CurrentUser,
    ) -> None:
        await self._service.delete_connector(user_sso, connector_id, caller=caller)

    async def list_tools(
        self,
        user_sso: str,
        connector_id: uuid.UUID,
        *,
        caller: CurrentUser,
        cipher: SecretCipher | None,
        list_tools: McpToolLister,
    ) -> ApiEnvelope[ConnectorToolsRead]:
        tools = await self._service.list_connector_tools(
            user_sso,
            connector_id,
            caller=caller,
            cipher=cipher,
            list_tools=list_tools,
        )
        return ApiEnvelope[ConnectorToolsRead](
            data=tools,
            error=None,
            metadata=ApiMetadata(request_id=request_id_ctx.get()),
            pagination=None,
        )
