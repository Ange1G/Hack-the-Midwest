import uuid

from fastapi import APIRouter, Depends, Header, Query, status

from app.api.deps import get_current_user, get_executions_controller
from app.common.envelope import ApiEnvelope
from app.core.auth import CurrentUser
from app.core.config import Settings, get_settings
from app.domains.executions.controller import ExecutionsController
from app.domains.executions.schemas import ExecutionComplete, ExecutionCreate, ExecutionRead

router = APIRouter()
internal_router = APIRouter()


@router.post(
    "/{user_sso}/{agent_id}/executions",
    status_code=status.HTTP_202_ACCEPTED,
)
async def enqueue_execution(
    user_sso: str,
    agent_id: uuid.UUID,
    body: ExecutionCreate | None = None,
    controller: ExecutionsController = Depends(get_executions_controller),
    caller: CurrentUser = Depends(get_current_user),
) -> ApiEnvelope[ExecutionRead]:
    return await controller.enqueue(user_sso, agent_id, body=body, caller=caller)


@router.get("/{user_sso}/executions")
async def list_executions(
    user_sso: str,
    page: int = Query(default=1, ge=1),
    page_size: int | None = Query(default=None, ge=1),
    controller: ExecutionsController = Depends(get_executions_controller),
    caller: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ApiEnvelope[list[ExecutionRead]]:
    return await controller.list_by_user_sso(
        user_sso,
        page=page,
        page_size=page_size or settings.default_page_size,
        caller=caller,
    )


@router.get("/{user_sso}/executions/{execution_id}")
async def get_execution(
    user_sso: str,
    execution_id: uuid.UUID,
    controller: ExecutionsController = Depends(get_executions_controller),
    caller: CurrentUser = Depends(get_current_user),
) -> ApiEnvelope[ExecutionRead]:
    return await controller.get(user_sso, execution_id, caller=caller)


@internal_router.post("/{execution_id}/complete")
async def complete_execution(
    execution_id: uuid.UUID,
    body: ExecutionComplete,
    controller: ExecutionsController = Depends(get_executions_controller),
    x_execution_callback_token: str | None = Header(
        default=None, alias="X-Execution-Callback-Token"
    ),
) -> ApiEnvelope[ExecutionRead]:
    return await controller.complete(
        execution_id, body, token=x_execution_callback_token
    )
