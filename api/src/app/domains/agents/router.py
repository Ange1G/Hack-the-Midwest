from fastapi import APIRouter, Depends, Query

from app.core.auth import CurrentUser
from app.api.deps import get_agents_controller, get_current_user
from app.common.envelope import ApiEnvelope
from app.core.config import Settings, get_settings
from app.domains.agents.controller import AgentsController
from app.domains.agents.schemas import AgentRead

router = APIRouter()


@router.get("/{user_sso}")
async def list_agents_by_user_sso(
    user_sso: str,
    page: int = Query(default=1, ge=1),
    page_size: int | None = Query(default=None, ge=1),
    controller: AgentsController = Depends(get_agents_controller),
    caller: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ApiEnvelope[list[AgentRead]]:
    resolved_page_size = page_size or settings.default_page_size
    return await controller.list_by_user_sso(
        user_sso,
        page=page,
        page_size=resolved_page_size,
        caller=caller,
    )
