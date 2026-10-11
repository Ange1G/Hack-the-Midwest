import uuid
from typing import Protocol

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import offset_for_page
from app.domains.chains.models import AgentChain, AgentChainStep, ChainRun, ChainRunStep


class ChainRepository(Protocol):
    async def create(self, chain: AgentChain, steps: list[AgentChainStep]) -> AgentChain: ...

    async def get_owned(self, owner_user_sso: str, chain_id: uuid.UUID) -> AgentChain | None: ...

    async def list_steps(self, chain_id: uuid.UUID) -> list[AgentChainStep]: ...

    async def list_by_owner(
        self, owner_user_sso: str, *, page: int, page_size: int
    ) -> tuple[list[AgentChain], int]: ...

    async def delete_owned(self, owner_user_sso: str, chain_id: uuid.UUID) -> bool: ...

    async def any_chain_references_agent(
        self, owner_user_sso: str, agent_id: uuid.UUID
    ) -> bool: ...

    async def create_run(self, run: ChainRun, steps: list[ChainRunStep]) -> ChainRun: ...

    async def get_run_owned(self, owner_user_sso: str, run_id: uuid.UUID) -> ChainRun | None: ...

    async def get_run(self, run_id: uuid.UUID) -> ChainRun | None: ...

    async def list_run_steps(self, run_id: uuid.UUID) -> list[ChainRunStep]: ...

    async def get_run_step_by_execution(self, execution_id: uuid.UUID) -> ChainRunStep | None: ...

    async def save_run(self, run: ChainRun) -> ChainRun: ...

    async def save_run_step(self, step: ChainRunStep) -> ChainRunStep: ...


class SqlAlchemyChainRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, chain: AgentChain, steps: list[AgentChainStep]) -> AgentChain:
        self._session.add(chain)
        await self._session.flush()
        for step in steps:
            step.chain_id = chain.id
            self._session.add(step)
        await self._session.commit()
        await self._session.refresh(chain)
        return chain

    async def get_owned(self, owner_user_sso: str, chain_id: uuid.UUID) -> AgentChain | None:
        result = await self._session.execute(
            select(AgentChain).where(
                AgentChain.id == chain_id,
                AgentChain.owner_user_sso == owner_user_sso,
            )
        )
        return result.scalar_one_or_none()

    async def list_steps(self, chain_id: uuid.UUID) -> list[AgentChainStep]:
        result = await self._session.execute(
            select(AgentChainStep)
            .where(AgentChainStep.chain_id == chain_id)
            .order_by(AgentChainStep.position, AgentChainStep.id)
        )
        return list(result.scalars().all())

    async def list_by_owner(
        self, owner_user_sso: str, *, page: int, page_size: int
    ) -> tuple[list[AgentChain], int]:
        total = await self._session.scalar(
            select(func.count())
            .select_from(AgentChain)
            .where(AgentChain.owner_user_sso == owner_user_sso)
        )
        result = await self._session.execute(
            select(AgentChain)
            .where(AgentChain.owner_user_sso == owner_user_sso)
            .order_by(AgentChain.created_at.desc(), AgentChain.id)
            .offset(offset_for_page(page, page_size))
            .limit(page_size)
        )
        return list(result.scalars().all()), int(total or 0)

    async def delete_owned(self, owner_user_sso: str, chain_id: uuid.UUID) -> bool:
        chain = await self.get_owned(owner_user_sso, chain_id)
        if chain is None:
            return False
        await self._session.delete(chain)
        await self._session.commit()
        return True

    async def any_chain_references_agent(
        self, owner_user_sso: str, agent_id: uuid.UUID
    ) -> bool:
        """Return True if the owner has at least one chain that contains agent_id as a step."""
        result = await self._session.execute(
            select(AgentChainStep.id)
            .join(AgentChain, AgentChain.id == AgentChainStep.chain_id)
            .where(
                AgentChain.owner_user_sso == owner_user_sso,
                AgentChainStep.agent_id == agent_id,
            )
            .limit(1)
        )
        return result.scalar_one_or_none() is not None

    async def create_run(self, run: ChainRun, steps: list[ChainRunStep]) -> ChainRun:
        self._session.add(run)
        await self._session.flush()
        for step in steps:
            step.chain_run_id = run.id
            self._session.add(step)
        await self._session.commit()
        await self._session.refresh(run)
        return run

    async def get_run_owned(self, owner_user_sso: str, run_id: uuid.UUID) -> ChainRun | None:
        result = await self._session.execute(
            select(ChainRun).where(
                ChainRun.id == run_id,
                ChainRun.owner_user_sso == owner_user_sso,
            )
        )
        return result.scalar_one_or_none()

    async def get_run(self, run_id: uuid.UUID) -> ChainRun | None:
        result = await self._session.execute(select(ChainRun).where(ChainRun.id == run_id))
        return result.scalar_one_or_none()

    async def list_run_steps(self, run_id: uuid.UUID) -> list[ChainRunStep]:
        result = await self._session.execute(
            select(ChainRunStep)
            .where(ChainRunStep.chain_run_id == run_id)
            .order_by(ChainRunStep.position, ChainRunStep.id)
        )
        return list(result.scalars().all())

    async def get_run_step_by_execution(self, execution_id: uuid.UUID) -> ChainRunStep | None:
        result = await self._session.execute(
            select(ChainRunStep).where(ChainRunStep.execution_id == execution_id)
        )
        return result.scalar_one_or_none()

    async def save_run(self, run: ChainRun) -> ChainRun:
        self._session.add(run)
        await self._session.commit()
        await self._session.refresh(run)
        return run

    async def save_run_step(self, step: ChainRunStep) -> ChainRunStep:
        self._session.add(step)
        await self._session.commit()
        await self._session.refresh(step)
        return step
