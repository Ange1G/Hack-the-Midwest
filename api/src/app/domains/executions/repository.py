import uuid
from datetime import UTC, datetime
from typing import Any, Protocol

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import offset_for_page
from app.domains.executions.models import TERMINAL_STATUSES, AgentExecution, ExecutionStatus


class ExecutionRepository(Protocol):
    async def create(self, execution: AgentExecution) -> AgentExecution: ...

    async def get_by_id(self, execution_id: uuid.UUID) -> AgentExecution | None: ...

    async def get_owned(
        self, owner_user_sso: str, execution_id: uuid.UUID
    ) -> AgentExecution | None: ...

    async def list_by_owner(
        self, owner_user_sso: str, *, page: int, page_size: int
    ) -> tuple[list[AgentExecution], int]: ...

    async def claim_next(self, token_hash: str) -> AgentExecution | None: ...

    async def complete_if_running(
        self,
        execution_id: uuid.UUID,
        *,
        status: str,
        result: dict[str, Any] | None,
        error_code: str | None,
        error_message: str | None,
    ) -> AgentExecution | None: ...

    async def fail_if_running(
        self,
        execution_id: uuid.UUID,
        *,
        status: str,
        error_code: str,
        error_message: str,
        runner_meta: dict[str, Any] | None = None,
    ) -> AgentExecution | None: ...

    async def merge_runner_meta(
        self, execution_id: uuid.UUID, runner_meta: dict[str, Any]
    ) -> None: ...


class SqlAlchemyExecutionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, execution: AgentExecution) -> AgentExecution:
        self._session.add(execution)
        await self._session.commit()
        await self._session.refresh(execution)
        return execution

    async def get_by_id(self, execution_id: uuid.UUID) -> AgentExecution | None:
        result = await self._session.execute(
            select(AgentExecution).where(AgentExecution.id == execution_id)
        )
        return result.scalar_one_or_none()

    async def get_owned(
        self, owner_user_sso: str, execution_id: uuid.UUID
    ) -> AgentExecution | None:
        result = await self._session.execute(
            select(AgentExecution).where(
                AgentExecution.id == execution_id,
                AgentExecution.owner_user_sso == owner_user_sso,
            )
        )
        return result.scalar_one_or_none()

    async def list_by_owner(
        self, owner_user_sso: str, *, page: int, page_size: int
    ) -> tuple[list[AgentExecution], int]:
        total = await self._session.scalar(
            select(func.count())
            .select_from(AgentExecution)
            .where(AgentExecution.owner_user_sso == owner_user_sso)
        )
        result = await self._session.execute(
            select(AgentExecution)
            .where(AgentExecution.owner_user_sso == owner_user_sso)
            .order_by(AgentExecution.created_at.desc(), AgentExecution.id)
            .offset(offset_for_page(page, page_size))
            .limit(page_size)
        )
        return list(result.scalars().all()), int(total or 0)

    async def claim_next(self, token_hash: str) -> AgentExecution | None:
        result = await self._session.execute(
            select(AgentExecution)
            .where(AgentExecution.status == ExecutionStatus.QUEUED.value)
            .order_by(AgentExecution.created_at.asc(), AgentExecution.id)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        execution = result.scalar_one_or_none()
        if execution is None:
            return None
        now = datetime.now(UTC)
        execution.status = ExecutionStatus.RUNNING.value
        execution.callback_token_hash = token_hash
        execution.started_at = now
        execution.updated_at = now
        await self._session.commit()
        await self._session.refresh(execution)
        return execution

    async def complete_if_running(
        self,
        execution_id: uuid.UUID,
        *,
        status: str,
        result: dict[str, Any] | None,
        error_code: str | None,
        error_message: str | None,
    ) -> AgentExecution | None:
        now = datetime.now(UTC)
        await self._session.execute(
            update(AgentExecution)
            .where(
                AgentExecution.id == execution_id,
                AgentExecution.status == ExecutionStatus.RUNNING.value,
            )
            .values(
                status=status,
                result=result,
                error_code=error_code,
                error_message=error_message,
                finished_at=now,
                updated_at=now,
            )
        )
        await self._session.commit()
        return await self.get_by_id(execution_id)

    async def fail_if_running(
        self,
        execution_id: uuid.UUID,
        *,
        status: str,
        error_code: str,
        error_message: str,
        runner_meta: dict[str, Any] | None = None,
    ) -> AgentExecution | None:
        now = datetime.now(UTC)
        values: dict[str, Any] = {
            "status": status,
            "error_code": error_code,
            "error_message": error_message,
            "finished_at": now,
            "updated_at": now,
        }
        if runner_meta is not None:
            values["runner_meta"] = runner_meta
        await self._session.execute(
            update(AgentExecution)
            .where(
                AgentExecution.id == execution_id,
                AgentExecution.status == ExecutionStatus.RUNNING.value,
            )
            .values(**values)
        )
        await self._session.commit()
        return await self.get_by_id(execution_id)

    async def merge_runner_meta(
        self, execution_id: uuid.UUID, runner_meta: dict[str, Any]
    ) -> None:
        execution = await self.get_by_id(execution_id)
        if execution is None:
            return
        merged = {**(execution.runner_meta or {}), **runner_meta}
        execution.runner_meta = merged
        execution.updated_at = datetime.now(UTC)
        await self._session.commit()


def is_terminal(status: str) -> bool:
    return status in {item.value for item in TERMINAL_STATUSES}
