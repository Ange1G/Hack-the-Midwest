import uuid
from typing import Protocol

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import offset_for_page
from app.domains.agents.models import Agent


class AgentRepository(Protocol):
    async def list_by_owner(
        self,
        owner_user_sso: str,
        *,
        page: int,
        page_size: int,
    ) -> tuple[list[Agent], int]: ...

    async def create(self, agent: Agent) -> Agent: ...

    async def get_owned(self, owner_user_sso: str, agent_id: uuid.UUID) -> Agent | None: ...

    async def save(self, agent: Agent) -> Agent: ...

    async def delete_owned(self, owner_user_sso: str, agent_id: uuid.UUID) -> bool: ...

    async def detach_connector(
        self, owner_user_sso: str, connector_id: uuid.UUID
    ) -> int: ...

    async def detach_delegate(
        self, owner_user_sso: str, delegate_id: uuid.UUID
    ) -> int: ...


class SqlAlchemyAgentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_owner(
        self,
        owner_user_sso: str,
        *,
        page: int,
        page_size: int,
    ) -> tuple[list[Agent], int]:
        count_stmt = (
            select(func.count())
            .select_from(Agent)
            .where(Agent.owner_user_sso == owner_user_sso)
        )
        total_result = await self._session.execute(count_stmt)
        total_items = int(total_result.scalar_one())

        offset = offset_for_page(page, page_size)
        list_stmt = (
            select(Agent)
            .where(Agent.owner_user_sso == owner_user_sso)
            .order_by(Agent.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        result = await self._session.execute(list_stmt)
        agents = list(result.scalars().all())
        return agents, total_items

    async def add(self, agent: Agent) -> Agent:
        self._session.add(agent)
        await self._session.flush()
        return agent

    async def create(self, agent: Agent) -> Agent:
        self._session.add(agent)
        await self._session.commit()
        await self._session.refresh(agent)  # load server-side timestamps
        return agent

    async def get_owned(self, owner_user_sso: str, agent_id: uuid.UUID) -> Agent | None:
        result = await self._session.execute(
            select(Agent).where(Agent.id == agent_id, Agent.owner_user_sso == owner_user_sso)
        )
        return result.scalar_one_or_none()

    async def save(self, agent: Agent) -> Agent:
        await self._session.commit()
        await self._session.refresh(agent)
        return agent

    async def delete_owned(self, owner_user_sso: str, agent_id: uuid.UUID) -> bool:
        """Delete an agent belonging to the owner. Returns True if deleted, False if not found."""
        agent = await self.get_owned(owner_user_sso, agent_id)
        if agent is None:
            return False
        await self._session.delete(agent)
        await self._session.commit()
        return True

    async def detach_connector(
        self, owner_user_sso: str, connector_id: uuid.UUID
    ) -> int:
        """Remove connector_id from configurations.primitives for all owner's agents that reference it.

        Returns the number of agents updated. Flushes within the session but does not commit;
        callers are expected to commit once both the detach and the connector delete succeed.
        """
        key = str(connector_id)
        result = await self._session.execute(
            select(Agent).where(
                Agent.owner_user_sso == owner_user_sso,
                Agent.configurations["primitives"].has_key(key),  # noqa: W601
            )
        )
        agents = list(result.scalars().all())
        for agent in agents:
            primitives = dict(agent.configurations.get("primitives", {}))
            primitives.pop(key, None)
            agent.configurations = {**agent.configurations, "primitives": primitives}
        if agents:
            await self._session.flush()
        return len(agents)

    async def detach_delegate(
        self, owner_user_sso: str, delegate_id: uuid.UUID
    ) -> int:
        """Remove delegate_id from configurations.delegates for all owner's agents that reference it.

        Returns the number of agents updated. Flushes within the session but does not commit;
        callers are expected to commit once both the detach and the agent delete succeed.
        """
        delegate_str = str(delegate_id)
        result = await self._session.execute(
            select(Agent).where(Agent.owner_user_sso == owner_user_sso)
        )
        agents = list(result.scalars().all())
        updated: list[Agent] = []
        for agent in agents:
            delegates: list[str] = list(agent.configurations.get("delegates", []))
            if delegate_str in delegates:
                new_delegates = [d for d in delegates if d != delegate_str]
                agent.configurations = {**agent.configurations, "delegates": new_delegates}
                updated.append(agent)
        if updated:
            await self._session.flush()
        return len(updated)
