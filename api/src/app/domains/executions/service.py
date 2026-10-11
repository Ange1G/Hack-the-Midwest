import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from app.common.pagination import clamp_page_size
from app.core.auth import CurrentUser, ensure_caller_owns
from app.core.config import Settings
from app.core.exceptions import AppError, NotFoundError, UnauthorizedError
from app.domains.agents.models import Agent
from app.domains.agents.repository import AgentRepository
from app.domains.executions.models import AgentExecution, ExecutionStatus
from app.domains.executions.repository import ExecutionRepository, is_terminal
from app.domains.executions.schemas import ExecutionComplete, ExecutionCreate, ExecutionRead
from app.domains.executions.tokens import callback_token_matches

TerminalHook = Callable[[AgentExecution], Awaitable[None]]


class ExecutionService:
    def __init__(
        self,
        executions: ExecutionRepository,
        agents: AgentRepository,
        *,
        terminal_hook: TerminalHook | None = None,
    ) -> None:
        self._executions = executions
        self._agents = agents
        self._terminal_hook = terminal_hook

    def set_terminal_hook(self, hook: TerminalHook | None) -> None:
        self._terminal_hook = hook

    async def enqueue(
        self,
        owner_user_sso: str,
        agent_id: uuid.UUID,
        *,
        caller: CurrentUser,
        settings: Settings,
        body: ExecutionCreate | None = None,
    ) -> ExecutionRead:
        ensure_caller_owns(owner_user_sso, caller)
        agent = await self._agents.get_owned(owner_user_sso, agent_id)
        if agent is None:
            raise NotFoundError("Agent not found")
        active = await self._executions.count_active_by_owner(owner_user_sso)
        if active >= settings.max_active_executions_per_owner:
            raise AppError(
                code="too_many_executions",
                message=(
                    "Too many queued or running executions; "
                    f"limit is {settings.max_active_executions_per_owner}"
                ),
                status_code=429,
            )
        created = await self._executions.create(
            AgentExecution(
                agent_id=agent.id,
                owner_user_sso=caller.user_sso,
                status=ExecutionStatus.QUEUED.value,
                input=body.input if body is not None else None,
            )
        )
        return ExecutionRead.model_validate(created)

    async def get(
        self,
        owner_user_sso: str,
        execution_id: uuid.UUID,
        *,
        caller: CurrentUser,
    ) -> ExecutionRead:
        ensure_caller_owns(owner_user_sso, caller)
        execution = await self._executions.get_owned(owner_user_sso, execution_id)
        if execution is None:
            raise NotFoundError("Execution not found")
        return ExecutionRead.model_validate(execution)

    async def list_for_owner(
        self,
        owner_user_sso: str,
        *,
        page: int,
        page_size: int,
        caller: CurrentUser,
        settings: Settings,
    ) -> tuple[list[ExecutionRead], int, int, int]:
        ensure_caller_owns(owner_user_sso, caller)
        bounded_page_size = clamp_page_size(page_size, settings.max_page_size)
        rows, total_items = await self._executions.list_by_owner(
            owner_user_sso, page=page, page_size=bounded_page_size
        )
        items = [ExecutionRead.model_validate(row) for row in rows]
        return items, total_items, page, bounded_page_size

    async def complete(
        self,
        execution_id: uuid.UUID,
        body: ExecutionComplete,
        *,
        token: str | None,
    ) -> ExecutionRead:
        execution = await self._executions.get_by_id(execution_id)
        if execution is None:
            raise NotFoundError("Execution not found")
        if (
            not token
            or not execution.callback_token_hash
            or not callback_token_matches(token, execution.callback_token_hash)
        ):
            raise UnauthorizedError("Invalid execution callback token")
        if is_terminal(execution.status):
            await self._notify_terminal(execution)
            return ExecutionRead.model_validate(execution)

        status = (
            ExecutionStatus.SUCCEEDED.value
            if body.status == "succeeded"
            else ExecutionStatus.FAILED.value
        )
        updated = await self._executions.complete_if_running(
            execution_id,
            status=status,
            result=body.result,
            error_code=body.error.code if body.error else None,
            error_message=body.error.message if body.error else None,
        )
        if updated is None:
            raise NotFoundError("Execution not found")
        await self._notify_terminal(updated)
        return ExecutionRead.model_validate(updated)

    async def _notify_terminal(self, execution: AgentExecution) -> None:
        if self._terminal_hook is None:
            return
        await self._terminal_hook(execution)


def agent_manifest(agent: Agent) -> dict[str, Any]:
    configurations = agent.configurations or {}
    primitives = configurations.get("primitives") or {}
    return {
        "title": agent.title,
        "system_prompt": agent.system_prompt,
        "connector_ids": list(primitives.keys()),
    }
