import uuid

from fastapi import APIRouter, Depends, Path, status

from app.api.deps import get_current_user, get_memory_service
from app.common.envelope import ApiEnvelope, ApiMetadata
from app.core.auth import CurrentUser
from app.core.request_context import request_id_ctx
from app.domains.memory.schemas import MEMORY_KEY_PATTERN, MemoryEntryRead
from app.domains.memory.service import MemoryService

router = APIRouter()


@router.get("/{user_sso}/{agent_id}/memory")
async def list_memory(
    user_sso: str,
    agent_id: uuid.UUID,
    service: MemoryService = Depends(get_memory_service),
    caller: CurrentUser = Depends(get_current_user),
) -> ApiEnvelope[list[MemoryEntryRead]]:
    entries = await service.list_entries(user_sso, agent_id, caller=caller)
    return ApiEnvelope[list[MemoryEntryRead]](
        data=entries,
        error=None,
        metadata=ApiMetadata(request_id=request_id_ctx.get()),
        pagination=None,
    )


@router.delete("/{user_sso}/{agent_id}/memory", status_code=status.HTTP_204_NO_CONTENT)
async def clear_memory(
    user_sso: str,
    agent_id: uuid.UUID,
    service: MemoryService = Depends(get_memory_service),
    caller: CurrentUser = Depends(get_current_user),
) -> None:
    await service.clear(user_sso, agent_id, caller=caller)


@router.delete(
    "/{user_sso}/{agent_id}/memory/{key}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_memory_key(
    user_sso: str,
    agent_id: uuid.UUID,
    key: str = Path(pattern=MEMORY_KEY_PATTERN),
    service: MemoryService = Depends(get_memory_service),
    caller: CurrentUser = Depends(get_current_user),
) -> None:
    await service.delete_entry(user_sso, agent_id, key, caller=caller)
