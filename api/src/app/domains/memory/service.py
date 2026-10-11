import uuid
from typing import Any

from app.core.auth import CurrentUser, ensure_caller_owns
from app.core.exceptions import NotFoundError
from app.domains.agents.repository import AgentRepository
from app.domains.memory.repository import MemoryRepository
from app.domains.memory.schemas import MAX_MEMORY_KEYS, MemoryEntryRead, MemoryWrites


def memory_enabled(configurations: dict[str, Any] | None) -> bool:
    return bool((configurations or {}).get("memory") is True)


async def stage_memory_writes(
    repository: MemoryRepository,
    *,
    agent_id: uuid.UUID,
    owner_user_sso: str,
    writes: MemoryWrites,
) -> dict[str, list[str]]:
    """Stage a run's memory changes in the caller's transaction.

    Deletes apply first. Existing keys are always updated; new keys are added until the
    agent holds MAX_MEMORY_KEYS and the rest are reported as dropped.
    """
    deleted = [key for key in dict.fromkeys(writes.delete) if key not in writes.set]
    await repository.stage_delete(agent_id, deleted)
    existing = await repository.keys(agent_id)
    room = MAX_MEMORY_KEYS - len(existing)
    applied: list[str] = []
    dropped: list[str] = []
    for key, value in writes.set.items():
        if key not in existing:
            if room <= 0:
                dropped.append(key)
                continue
            room -= 1
        await repository.stage_upsert(agent_id, owner_user_sso, key, value)
        applied.append(key)
    return {"set": applied, "deleted": deleted, "dropped": dropped}


class MemoryService:
    def __init__(self, memory: MemoryRepository, agents: AgentRepository) -> None:
        self._memory = memory
        self._agents = agents

    async def list_entries(
        self, owner_user_sso: str, agent_id: uuid.UUID, *, caller: CurrentUser
    ) -> list[MemoryEntryRead]:
        await self._owned_agent(owner_user_sso, agent_id, caller)
        rows = await self._memory.list_for_agent(agent_id)
        return [MemoryEntryRead.model_validate(row) for row in rows]

    async def delete_entry(
        self, owner_user_sso: str, agent_id: uuid.UUID, key: str, *, caller: CurrentUser
    ) -> None:
        await self._owned_agent(owner_user_sso, agent_id, caller)
        if not await self._memory.delete_keys(agent_id, [key]):
            raise NotFoundError("Memory key not found")

    async def clear(
        self, owner_user_sso: str, agent_id: uuid.UUID, *, caller: CurrentUser
    ) -> None:
        await self._owned_agent(owner_user_sso, agent_id, caller)
        await self._memory.delete_keys(agent_id, None)

    async def _owned_agent(
        self, owner_user_sso: str, agent_id: uuid.UUID, caller: CurrentUser
    ) -> None:
        ensure_caller_owns(owner_user_sso, caller)
        if await self._agents.get_owned(owner_user_sso, agent_id) is None:
            raise NotFoundError("Agent not found")
