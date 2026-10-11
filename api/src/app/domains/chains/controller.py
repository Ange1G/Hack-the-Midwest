import uuid

from app.common.envelope import ApiEnvelope, ApiMetadata, Pagination
from app.common.pagination import total_pages as compute_total_pages
from app.core.auth import CurrentUser
from app.core.config import Settings
from app.core.request_context import request_id_ctx
from app.domains.chains.schemas import ChainCreate, ChainRead, ChainRunRead, ChainRunStepRead
from app.domains.chains.service import ChainService
from app.domains.executions.schemas import ExecutionCreate


class ChainsController:
    def __init__(self, service: ChainService, settings: Settings) -> None:
        self._service = service
        self._settings = settings

    def _item(self, chain: ChainRead) -> ApiEnvelope[ChainRead]:
        return ApiEnvelope[ChainRead](
            data=chain,
            error=None,
            metadata=ApiMetadata(request_id=request_id_ctx.get()),
            pagination=None,
        )

    async def create(
        self,
        user_sso: str,
        body: ChainCreate,
        *,
        caller: CurrentUser,
    ) -> ApiEnvelope[ChainRead]:
        chain = await self._service.create(
            user_sso, body, caller=caller, settings=self._settings
        )
        return self._item(chain)

    async def get(
        self,
        user_sso: str,
        chain_id: uuid.UUID,
        *,
        caller: CurrentUser,
    ) -> ApiEnvelope[ChainRead]:
        chain = await self._service.get(user_sso, chain_id, caller=caller)
        return self._item(chain)

    async def list_by_user_sso(
        self,
        user_sso: str,
        *,
        page: int,
        page_size: int,
        caller: CurrentUser,
    ) -> ApiEnvelope[list[ChainRead]]:
        items, total_items, resolved_page, resolved_page_size = await self._service.list_for_owner(
            user_sso,
            page=page,
            page_size=page_size,
            caller=caller,
            settings=self._settings,
        )
        return ApiEnvelope[list[ChainRead]](
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
        chain_id: uuid.UUID,
        *,
        caller: CurrentUser,
    ) -> None:
        await self._service.delete(user_sso, chain_id, caller=caller)

    def _run_item(self, run: ChainRunRead) -> ApiEnvelope[ChainRunRead]:
        return ApiEnvelope[ChainRunRead](
            data=run,
            error=None,
            metadata=ApiMetadata(request_id=request_id_ctx.get()),
            pagination=None,
        )

    async def enqueue_run(
        self,
        user_sso: str,
        chain_id: uuid.UUID,
        *,
        body: ExecutionCreate | None = None,
        caller: CurrentUser,
    ) -> ApiEnvelope[ChainRunRead]:
        run = await self._service.enqueue_run(
            user_sso,
            chain_id,
            body=body,
            caller=caller,
            settings=self._settings,
        )
        return self._run_item(run)

    async def get_run(
        self,
        user_sso: str,
        run_id: uuid.UUID,
        *,
        caller: CurrentUser,
    ) -> ApiEnvelope[ChainRunRead]:
        run = await self._service.get_run(user_sso, run_id, caller=caller)
        return self._run_item(run)

    async def list_run_steps(
        self,
        user_sso: str,
        run_id: uuid.UUID,
        *,
        caller: CurrentUser,
    ) -> ApiEnvelope[list[ChainRunStepRead]]:
        steps = await self._service.list_run_steps(user_sso, run_id, caller=caller)
        return ApiEnvelope[list[ChainRunStepRead]](
            data=steps,
            error=None,
            metadata=ApiMetadata(request_id=request_id_ctx.get()),
            pagination=None,
        )
