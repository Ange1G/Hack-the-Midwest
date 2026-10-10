from app.core.auth import CurrentUser
from app.common.envelope import ApiEnvelope, ApiMetadata, Pagination
from app.common.pagination import total_pages as compute_total_pages
from app.core.config import Settings
from app.core.request_context import request_id_ctx
from app.domains.agents.schemas import AgentRead
from app.core.secrets import SecretCipher
from app.domains.agents.schemas import AgentCreate
from app.domains.agents.service import AgentService


class AgentsController:
    def __init__(self, service: AgentService, settings: Settings) -> None:
        self._service = service
        self._settings = settings

    async def list_by_user_sso(
        self,
        user_sso: str,
        *,
        page: int,
        page_size: int,
        caller: CurrentUser,
    ) -> ApiEnvelope[list[AgentRead]]:
        if page_size <= 0:
            page_size = self._settings.default_page_size

        items, total_items, resolved_page, resolved_page_size = (
            await self._service.list_agents_for_owner(
                user_sso,
                page=page,
                page_size=page_size,
                caller=caller,
                settings=self._settings,
            )
        )

        return ApiEnvelope[list[AgentRead]](
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

    async def create(
        self,
        user_sso: str,
        body: AgentCreate,
        *,
        caller: CurrentUser,
        cipher: SecretCipher | None,
    ) -> ApiEnvelope[AgentRead]:
        agent = await self._service.create_agent(user_sso, body, caller=caller, cipher=cipher)
        return ApiEnvelope[AgentRead](
            data=agent,
            error=None,
            metadata=ApiMetadata(request_id=request_id_ctx.get()),
            pagination=None,
        )
