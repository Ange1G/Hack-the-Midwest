import uuid

from app.common.envelope import ApiEnvelope, ApiMetadata, Pagination
from app.common.pagination import total_pages as compute_total_pages
from app.core.auth import CurrentUser
from app.core.config import Settings
from app.core.request_context import request_id_ctx
from app.domains.executions.schemas import ExecutionComplete, ExecutionRead
from app.domains.executions.service import ExecutionService


class ExecutionsController:
    def __init__(self, service: ExecutionService, settings: Settings) -> None:
        self._service = service
        self._settings = settings

    def _item(self, execution: ExecutionRead) -> ApiEnvelope[ExecutionRead]:
        return ApiEnvelope[ExecutionRead](
            data=execution,
            error=None,
            metadata=ApiMetadata(request_id=request_id_ctx.get()),
            pagination=None,
        )

    async def enqueue(
        self,
        user_sso: str,
        agent_id: uuid.UUID,
        *,
        caller: CurrentUser,
    ) -> ApiEnvelope[ExecutionRead]:
        execution = await self._service.enqueue(user_sso, agent_id, caller=caller)
        return self._item(execution)

    async def get(
        self,
        user_sso: str,
        execution_id: uuid.UUID,
        *,
        caller: CurrentUser,
    ) -> ApiEnvelope[ExecutionRead]:
        execution = await self._service.get(user_sso, execution_id, caller=caller)
        return self._item(execution)

    async def list_by_user_sso(
        self,
        user_sso: str,
        *,
        page: int,
        page_size: int,
        caller: CurrentUser,
    ) -> ApiEnvelope[list[ExecutionRead]]:
        items, total_items, resolved_page, resolved_page_size = await self._service.list_for_owner(
            user_sso,
            page=page,
            page_size=page_size,
            caller=caller,
            settings=self._settings,
        )
        return ApiEnvelope[list[ExecutionRead]](
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

    async def complete(
        self,
        execution_id: uuid.UUID,
        body: ExecutionComplete,
        *,
        token: str | None,
    ) -> ApiEnvelope[ExecutionRead]:
        execution = await self._service.complete(execution_id, body, token=token)
        return self._item(execution)
