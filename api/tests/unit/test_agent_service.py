import pytest

from app.core.auth import CurrentUser
from app.core.config import Settings
from app.core.exceptions import ForbiddenError
from app.domains.agents.models import Agent
from app.domains.agents.service import AgentService


class FakeAgentRepository:
    def __init__(self, agents: list[Agent]) -> None:
        self._agents = agents

    async def list_by_owner(
        self,
        owner_user_sso: str,
        *,
        page: int,
        page_size: int,
    ) -> tuple[list[Agent], int]:
        filtered = [a for a in self._agents if a.owner_user_sso == owner_user_sso]
        return filtered, len(filtered)


@pytest.mark.asyncio
async def test_list_agents_for_owner_forbidden_when_sso_mismatch() -> None:
    repo = FakeAgentRepository([])
    service = AgentService(repo)
    settings = Settings(app_env="test")

    with pytest.raises(ForbiddenError):
        await service.list_agents_for_owner(
            "sso-other",
            page=1,
            page_size=20,
            caller=CurrentUser(user_sso="sso-me"),
            settings=settings,
        )
