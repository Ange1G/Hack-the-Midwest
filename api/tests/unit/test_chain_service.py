import uuid
from datetime import UTC, datetime

import pytest

from app.core.auth import CurrentUser
from app.core.config import Settings
from app.core.exceptions import AppError, ForbiddenError, NotFoundError
from app.domains.agents.models import Agent
from app.domains.chains.models import AgentChain, AgentChainStep
from app.domains.chains.schemas import ChainCreate, ChainStepCreate
from app.domains.chains.service import ChainService

ME = CurrentUser(user_sso="sso-me")
OTHER = CurrentUser(user_sso="sso-other")
AGENT_A = uuid.uuid4()
AGENT_B = uuid.uuid4()
SETTINGS = Settings(app_env="test", max_chain_steps=3)


def _agent(agent_id: uuid.UUID, owner: str = "sso-me") -> Agent:
    now = datetime.now(UTC)
    return Agent(
        id=agent_id,
        title="Step",
        system_prompt="Do work",
        configurations={"primitives": {}},
        owner_user_sso=owner,
        created_at=now,
        updated_at=now,
    )


class FakeAgents:
    def __init__(self, agents: list[Agent]) -> None:
        self._agents = agents

    async def get_owned(self, owner_user_sso: str, agent_id: uuid.UUID) -> Agent | None:
        for agent in self._agents:
            if agent.id == agent_id and agent.owner_user_sso == owner_user_sso:
                return agent
        return None


class FakeChains:
    def __init__(self) -> None:
        self.rows: dict[uuid.UUID, AgentChain] = {}
        self.steps: dict[uuid.UUID, list[AgentChainStep]] = {}

    async def create(self, chain: AgentChain, steps: list[AgentChainStep]) -> AgentChain:
        now = datetime.now(UTC)
        chain.id = uuid.uuid4()
        chain.created_at = now
        chain.updated_at = now
        self.rows[chain.id] = chain
        for index, step in enumerate(steps):
            step.id = uuid.uuid4()
            step.chain_id = chain.id
            step.position = index
        self.steps[chain.id] = steps
        return chain

    async def get_owned(
        self, owner_user_sso: str, chain_id: uuid.UUID
    ) -> AgentChain | None:
        chain = self.rows.get(chain_id)
        if chain is None or chain.owner_user_sso != owner_user_sso:
            return None
        return chain

    async def list_steps(self, chain_id: uuid.UUID) -> list[AgentChainStep]:
        return list(self.steps.get(chain_id, []))

    async def list_by_owner(
        self, owner_user_sso: str, *, page: int, page_size: int
    ) -> tuple[list[AgentChain], int]:
        items = [row for row in self.rows.values() if row.owner_user_sso == owner_user_sso]
        return items, len(items)

    async def delete_owned(self, owner_user_sso: str, chain_id: uuid.UUID) -> bool:
        chain = self.rows.get(chain_id)
        if chain is None or chain.owner_user_sso != owner_user_sso:
            return False
        del self.rows[chain_id]
        self.steps.pop(chain_id, None)
        return True


class _UnusedExecutions:
    pass


def _service(agents: list[Agent] | None = None) -> tuple[ChainService, FakeChains]:
    chains = FakeChains()
    service = ChainService(
        chains,
        FakeAgents(agents if agents is not None else [_agent(AGENT_A), _agent(AGENT_B)]),
        _UnusedExecutions(),  # type: ignore[arg-type]
    )
    return service, chains


def _body(*agent_ids: uuid.UUID, title: str = "Triage") -> ChainCreate:
    return ChainCreate(
        title=title,
        steps=[ChainStepCreate(agent_id=agent_id) for agent_id in agent_ids],
    )


async def test_create_assigns_positions_in_order() -> None:
    service, _ = _service()
    created = await service.create("sso-me", _body(AGENT_A, AGENT_B), caller=ME, settings=SETTINGS)
    assert [step.agent_id for step in created.steps] == [AGENT_A, AGENT_B]
    assert [step.position for step in created.steps] == [0, 1]
    assert created.title == "Triage"


async def test_create_rejects_foreign_agent() -> None:
    service, chains = _service()
    with pytest.raises(AppError) as exc:
        await service.create(
            "sso-me",
            _body(AGENT_A, uuid.uuid4()),
            caller=ME,
            settings=SETTINGS,
        )
    assert exc.value.status_code == 422
    assert chains.rows == {}


async def test_create_rejects_too_many_steps() -> None:
    extra = uuid.uuid4()
    service, _ = _service(agents=[_agent(AGENT_A), _agent(AGENT_B), _agent(extra)])
    with pytest.raises(AppError) as exc:
        await service.create(
            "sso-me",
            _body(AGENT_A, AGENT_B, extra, extra),
            caller=ME,
            settings=SETTINGS,
        )
    assert exc.value.status_code == 422


async def test_create_forbidden_for_other_user() -> None:
    service, _ = _service()
    with pytest.raises(ForbiddenError):
        await service.create("sso-me", _body(AGENT_A), caller=OTHER, settings=SETTINGS)


async def test_get_missing_chain_is_not_found() -> None:
    service, _ = _service()
    with pytest.raises(NotFoundError):
        await service.get("sso-me", uuid.uuid4(), caller=ME)


async def test_delete_owned_chain() -> None:
    service, chains = _service()
    created = await service.create("sso-me", _body(AGENT_A), caller=ME, settings=SETTINGS)
    await service.delete("sso-me", created.id, caller=ME)
    assert created.id not in chains.rows
