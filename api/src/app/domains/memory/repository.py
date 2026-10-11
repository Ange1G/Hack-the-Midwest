import uuid
from collections.abc import Collection
from typing import Any, Protocol

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.memory.models import AgentMemory


class MemoryRepository(Protocol):
    """`stage_*` methods do not commit; the caller's transaction decides."""

    async def list_for_agent(self, agent_id: uuid.UUID) -> list[AgentMemory]: ...

    async def keys(self, agent_id: uuid.UUID) -> set[str]: ...

    async def stage_upsert(
        self, agent_id: uuid.UUID, owner_user_sso: str, key: str, value: Any
    ) -> None: ...

    async def stage_delete(self, agent_id: uuid.UUID, keys: Collection[str]) -> None: ...

    async def delete_keys(self, agent_id: uuid.UUID, keys: Collection[str] | None) -> int: ...


class SqlAlchemyMemoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_for_agent(self, agent_id: uuid.UUID) -> list[AgentMemory]:
        result = await self._session.execute(
            select(AgentMemory).where(AgentMemory.agent_id == agent_id).order_by(AgentMemory.key)
        )
        return list(result.scalars().all())

    async def keys(self, agent_id: uuid.UUID) -> set[str]:
        result = await self._session.execute(
            select(AgentMemory.key).where(AgentMemory.agent_id == agent_id)
        )
        return set(result.scalars().all())

    async def stage_upsert(
        self, agent_id: uuid.UUID, owner_user_sso: str, key: str, value: Any
    ) -> None:
        statement = insert(AgentMemory).values(
            agent_id=agent_id, owner_user_sso=owner_user_sso, key=key, value=value
        )
        await self._session.execute(
            statement.on_conflict_do_update(
                constraint="uq_agent_memories_agent_key",
                set_={"value": statement.excluded.value, "updated_at": func.now()},
            )
        )

    async def stage_delete(self, agent_id: uuid.UUID, keys: Collection[str]) -> None:
        if not keys:
            return
        await self._session.execute(
            delete(AgentMemory).where(AgentMemory.agent_id == agent_id, AgentMemory.key.in_(keys))
        )

    async def delete_keys(self, agent_id: uuid.UUID, keys: Collection[str] | None) -> int:
        """Delete the given keys (all keys when None) and commit. Returns rows removed."""
        statement = delete(AgentMemory).where(AgentMemory.agent_id == agent_id)
        if keys is not None:
            statement = statement.where(AgentMemory.key.in_(keys))
        result = await self._session.execute(statement)
        await self._session.commit()
        return int(result.rowcount or 0)
