from app.core.auth import CurrentUser
from app.common.pagination import clamp_page_size, total_pages
from app.core.config import Settings
from app.core.exceptions import ForbiddenError
from app.domains.agents.repository import AgentRepository
from app.domains.agents.schemas import AgentRead


class AgentService:
    def __init__(self, repository: AgentRepository) -> None:
        self._repository = repository

    def _ensure_caller_may_access(self, requested_user_sso: str, caller: CurrentUser) -> None:
        if caller.user_sso != requested_user_sso:
            raise ForbiddenError(
                "You may not access agents for another user",
            )

    async def list_agents_for_owner(
        self,
        owner_user_sso: str,
        *,
        page: int,
        page_size: int,
        caller: CurrentUser,
        settings: Settings,
    ) -> tuple[list[AgentRead], int, int, int]:
        self._ensure_caller_may_access(owner_user_sso, caller)
        bounded_page_size = clamp_page_size(page_size, settings.max_page_size)
        agents, total_items = await self._repository.list_by_owner(
            owner_user_sso,
            page=page,
            page_size=bounded_page_size,
        )
        items = [AgentRead.model_validate(a) for a in agents]
        return (
            items,
            total_items,
            page,
            bounded_page_size,
        )
