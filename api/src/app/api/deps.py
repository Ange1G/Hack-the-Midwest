from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.exceptions import UnauthorizedError
from app.domains.agents.controller import AgentsController
from app.domains.agents.repository import SqlAlchemyAgentRepository
from app.domains.agents.service import AgentService


async def get_current_user(
    settings: Settings = Depends(get_settings),
    x_dev_user_sso: str | None = Header(default=None, alias="X-Dev-User-SSO"),
) -> CurrentUser:
    if settings.app_env == "development" or settings.app_env == "test":
        if not x_dev_user_sso:
            raise UnauthorizedError(
                "Missing X-Dev-User-SSO header (required in development/test)",
            )
        return CurrentUser(user_sso=x_dev_user_sso)
    raise UnauthorizedError(
        "Production authentication is not configured",
    )


async def get_agent_service(
    session: AsyncSession = Depends(get_db),
) -> AgentService:
    repository = SqlAlchemyAgentRepository(session)
    return AgentService(repository)


async def get_agents_controller(
    service: AgentService = Depends(get_agent_service),
    settings: Settings = Depends(get_settings),
) -> AgentsController:
    return AgentsController(service=service, settings=settings)
