import uuid

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_chains_controller, get_current_user
from app.common.envelope import ApiEnvelope
from app.core.auth import CurrentUser
from app.core.config import Settings, get_settings
from app.domains.chains.controller import ChainsController
from app.domains.chains.schemas import ChainCreate, ChainRead, ChainRunRead, ChainRunStepRead
from app.domains.executions.schemas import ExecutionCreate

router = APIRouter()


@router.get("/{user_sso}")
async def list_chains(
    user_sso: str,
    page: int = Query(default=1, ge=1),
    page_size: int | None = Query(default=None, ge=1),
    controller: ChainsController = Depends(get_chains_controller),
    caller: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ApiEnvelope[list[ChainRead]]:
    return await controller.list_by_user_sso(
        user_sso,
        page=page,
        page_size=page_size or settings.default_page_size,
        caller=caller,
    )


@router.post("/{user_sso}", status_code=status.HTTP_201_CREATED)
async def create_chain(
    user_sso: str,
    body: ChainCreate,
    controller: ChainsController = Depends(get_chains_controller),
    caller: CurrentUser = Depends(get_current_user),
) -> ApiEnvelope[ChainRead]:
    return await controller.create(user_sso, body, caller=caller)


@router.post(
    "/{user_sso}/{chain_id}/runs",
    status_code=status.HTTP_202_ACCEPTED,
)
async def enqueue_chain_run(
    user_sso: str,
    chain_id: uuid.UUID,
    body: ExecutionCreate | None = None,
    controller: ChainsController = Depends(get_chains_controller),
    caller: CurrentUser = Depends(get_current_user),
) -> ApiEnvelope[ChainRunRead]:
    return await controller.enqueue_run(user_sso, chain_id, body=body, caller=caller)


@router.get("/{user_sso}/runs/{chain_run_id}")
async def get_chain_run(
    user_sso: str,
    chain_run_id: uuid.UUID,
    controller: ChainsController = Depends(get_chains_controller),
    caller: CurrentUser = Depends(get_current_user),
) -> ApiEnvelope[ChainRunRead]:
    return await controller.get_run(user_sso, chain_run_id, caller=caller)


@router.get("/{user_sso}/runs/{chain_run_id}/steps")
async def list_chain_run_steps(
    user_sso: str,
    chain_run_id: uuid.UUID,
    controller: ChainsController = Depends(get_chains_controller),
    caller: CurrentUser = Depends(get_current_user),
) -> ApiEnvelope[list[ChainRunStepRead]]:
    return await controller.list_run_steps(user_sso, chain_run_id, caller=caller)


@router.get("/{user_sso}/{chain_id}")
async def get_chain(
    user_sso: str,
    chain_id: uuid.UUID,
    controller: ChainsController = Depends(get_chains_controller),
    caller: CurrentUser = Depends(get_current_user),
) -> ApiEnvelope[ChainRead]:
    return await controller.get(user_sso, chain_id, caller=caller)


@router.delete("/{user_sso}/{chain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chain(
    user_sso: str,
    chain_id: uuid.UUID,
    controller: ChainsController = Depends(get_chains_controller),
    caller: CurrentUser = Depends(get_current_user),
) -> None:
    await controller.delete(user_sso, chain_id, caller=caller)
