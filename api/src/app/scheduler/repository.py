import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.agents.models import Agent
from app.domains.chains.models import AgentChain
from app.scheduler.models import ScheduledChainFire, ScheduledExecutionFire


class SchedulerRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_agents(self, *, page: int, page_size: int) -> list[Agent]:
        offset = (page - 1) * page_size
        result = await self._session.execute(
            select(Agent).order_by(Agent.created_at.asc()).offset(offset).limit(page_size)
        )
        return list(result.scalars().all())

    async def list_chains(self, *, page: int, page_size: int) -> list[AgentChain]:
        offset = (page - 1) * page_size
        result = await self._session.execute(
            select(AgentChain)
            .where(AgentChain.schedule.is_not(None))
            .order_by(AgentChain.created_at.asc())
            .offset(offset)
            .limit(page_size)
        )
        return list(result.scalars().all())

    async def try_claim_slot(self, agent_id: uuid.UUID, slot_key: str) -> bool:
        """Insert the slot if new. Returns True when this process won the slot."""
        stmt = (
            insert(ScheduledExecutionFire)
            .values(agent_id=agent_id, slot_key=slot_key)
            .on_conflict_do_nothing(constraint="uq_scheduled_execution_fires_slot")
            .returning(ScheduledExecutionFire.id)
        )
        result = await self._session.execute(stmt)
        claimed = result.scalar_one_or_none() is not None
        if claimed:
            await self._session.commit()
        return claimed

    async def release_slot(self, agent_id: uuid.UUID, slot_key: str) -> None:
        await self._session.execute(
            delete(ScheduledExecutionFire).where(
                ScheduledExecutionFire.agent_id == agent_id,
                ScheduledExecutionFire.slot_key == slot_key,
            )
        )
        await self._session.commit()

    async def try_claim_chain_slot(self, chain_id: uuid.UUID, slot_key: str) -> bool:
        stmt = (
            insert(ScheduledChainFire)
            .values(chain_id=chain_id, slot_key=slot_key)
            .on_conflict_do_nothing(constraint="uq_scheduled_chain_fires_slot")
            .returning(ScheduledChainFire.id)
        )
        result = await self._session.execute(stmt)
        claimed = result.scalar_one_or_none() is not None
        if claimed:
            await self._session.commit()
        return claimed

    async def release_chain_slot(self, chain_id: uuid.UUID, slot_key: str) -> None:
        await self._session.execute(
            delete(ScheduledChainFire).where(
                ScheduledChainFire.chain_id == chain_id,
                ScheduledChainFire.slot_key == slot_key,
            )
        )
        await self._session.commit()

    async def count_fires(self, agent_id: uuid.UUID) -> int:
        result = await self._session.execute(
            select(func.count())
            .select_from(ScheduledExecutionFire)
            .where(ScheduledExecutionFire.agent_id == agent_id)
        )
        return int(result.scalar_one())
