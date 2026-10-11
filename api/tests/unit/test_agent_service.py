"""Unit tests for AgentService.delete_agent."""
import uuid

import pytest

from app.core.auth import CurrentUser
from app.core.exceptions import AppError, ForbiddenError, NotFoundError
from app.domains.agents.models import Agent
from app.domains.agents.service import AgentService

ME = CurrentUser(user_sso="sso-me")
AGENT_ID = uuid.uuid4()


# ---------------------------------------------------------------------------
# Minimal stub implementations
# ---------------------------------------------------------------------------


class StubAgentRepository:
    def __init__(self, *, agent: Agent | None = None, deleted: bool = True) -> None:
        self._agent = agent
        self._deleted = deleted
        self.detach_delegate_calls: list[tuple[str, uuid.UUID]] = []
        self.delete_owned_calls: list[tuple[str, uuid.UUID]] = []

    async def list_by_owner(self, *_a: object, **_k: object) -> tuple[list, int]:
        return [], 0

    async def create(self, a: object) -> object:
        return a

    async def get_owned(self, owner_user_sso: str, agent_id: uuid.UUID) -> Agent | None:
        return self._agent

    async def save(self, a: object) -> object:
        return a

    async def delete_owned(self, owner_user_sso: str, agent_id: uuid.UUID) -> bool:
        self.delete_owned_calls.append((owner_user_sso, agent_id))
        return self._deleted

    async def detach_connector(self, *_a: object, **_k: object) -> int:
        return 0

    async def detach_delegate(self, owner_user_sso: str, delegate_id: uuid.UUID) -> int:
        self.detach_delegate_calls.append((owner_user_sso, delegate_id))
        return 1


class StubChainGuard:
    def __init__(self, *, in_chain: bool = False) -> None:
        self._in_chain = in_chain

    async def any_chain_references_agent(
        self, owner_user_sso: str, agent_id: uuid.UUID
    ) -> bool:
        return self._in_chain


# ---------------------------------------------------------------------------
# delete_agent
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_agent_happy_path() -> None:
    repo = StubAgentRepository()
    chains = StubChainGuard()
    service = AgentService(repo)

    await service.delete_agent("sso-me", AGENT_ID, caller=ME, chains=chains)

    assert repo.detach_delegate_calls == [("sso-me", AGENT_ID)]
    assert repo.delete_owned_calls == [("sso-me", AGENT_ID)]


@pytest.mark.asyncio
async def test_delete_agent_forbidden_for_another_user() -> None:
    repo = StubAgentRepository()
    chains = StubChainGuard()
    service = AgentService(repo)

    with pytest.raises(ForbiddenError):
        await service.delete_agent("sso-them", AGENT_ID, caller=ME, chains=chains)

    assert repo.detach_delegate_calls == []
    assert repo.delete_owned_calls == []


@pytest.mark.asyncio
async def test_delete_agent_not_found_raises_not_found() -> None:
    repo = StubAgentRepository(deleted=False)
    chains = StubChainGuard()
    service = AgentService(repo)

    with pytest.raises(NotFoundError):
        await service.delete_agent("sso-me", AGENT_ID, caller=ME, chains=chains)


@pytest.mark.asyncio
async def test_delete_agent_detach_called_before_delete() -> None:
    """detach_delegate must be called even when the agent is later found missing."""
    order: list[str] = []

    class OrderedRepo(StubAgentRepository):
        async def detach_delegate(self, *_a: object, **_k: object) -> int:
            order.append("detach")
            return 0

        async def delete_owned(self, *_a: object, **_k: object) -> bool:
            order.append("delete")
            return True

    service = AgentService(OrderedRepo())
    chains = StubChainGuard()
    await service.delete_agent("sso-me", AGENT_ID, caller=ME, chains=chains)
    assert order == ["detach", "delete"]


@pytest.mark.asyncio
async def test_delete_agent_409_when_in_chain() -> None:
    repo = StubAgentRepository()
    chains = StubChainGuard(in_chain=True)
    service = AgentService(repo)

    with pytest.raises(AppError) as exc_info:
        await service.delete_agent("sso-me", AGENT_ID, caller=ME, chains=chains)

    assert exc_info.value.status_code == 409
    assert exc_info.value.code == "agent_in_use"
    # No delete or detach should have been attempted
    assert repo.delete_owned_calls == []
    assert repo.detach_delegate_calls == []
