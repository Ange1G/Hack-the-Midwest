from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser
from app.core.config import Settings
from app.core.exceptions import AppError
from app.domains.agents.repository import SqlAlchemyAgentRepository
from app.domains.chains.handoff import handoff_input
from app.domains.chains.models import ChainRun, ChainRunStatus, ChainRunStep, ChainRunStepStatus
from app.domains.chains.repository import ChainRepository, SqlAlchemyChainRepository
from app.domains.executions.models import AgentExecution, ExecutionStatus
from app.domains.executions.repository import SqlAlchemyExecutionRepository
from app.domains.executions.schemas import ExecutionCreate
from app.domains.executions.service import ExecutionService


class ChainOrchestrator:
    """Advance a chain run when a linked execution reaches a terminal status."""

    def __init__(
        self,
        chains: ChainRepository,
        executions: ExecutionService,
        settings: Settings,
    ) -> None:
        self._chains = chains
        self._executions = executions
        self._settings = settings

    async def on_execution_terminal(self, execution: AgentExecution) -> None:
        step = await self._chains.get_run_step_by_execution(execution.id)
        if step is None:
            return
        run = await self._chains.get_run(step.chain_run_id)
        if run is None or run.status != ChainRunStatus.RUNNING:
            return
        if step.status in {
            ChainRunStepStatus.SUCCEEDED,
            ChainRunStepStatus.FAILED,
            ChainRunStepStatus.SKIPPED,
        }:
            return

        steps = await self._chains.list_run_steps(run.id)
        if execution.status == ExecutionStatus.SUCCEEDED.value:
            await self._succeed_step(run, step, steps, execution)
            return
        await self._fail_step(run, step, steps, execution)

    async def _succeed_step(
        self,
        run: ChainRun,
        step: ChainRunStep,
        steps: list[ChainRunStep],
        execution: AgentExecution,
    ) -> None:
        step.status = ChainRunStepStatus.SUCCEEDED
        step.result = execution.result
        step.error_code = None
        step.error_message = None
        await self._chains.save_run_step(step)

        later = [item for item in steps if item.position > step.position]
        if not later:
            run.status = ChainRunStatus.SUCCEEDED
            run.final_result = execution.result
            run.finished_at = datetime.now(UTC)
            await self._chains.save_run(run)
            return

        nxt = min(later, key=lambda item: item.position)
        mapped = handoff_input(
            execution.result, max_bytes=self._settings.max_chain_handoff_bytes
        )
        try:
            created = await self._executions.enqueue(
                run.owner_user_sso,
                nxt.agent_id,
                caller=CurrentUser(user_sso=run.owner_user_sso),
                settings=self._settings,
                body=ExecutionCreate(input=mapped),
            )
        except AppError as exc:
            nxt.status = ChainRunStepStatus.FAILED
            nxt.error_code = exc.code
            nxt.error_message = exc.message
            await self._chains.save_run_step(nxt)
            await self._fail_run(run, steps, error_code=exc.code, error_message=exc.message)
            return
        nxt.status = ChainRunStepStatus.QUEUED
        nxt.execution_id = created.id
        nxt.input = mapped
        await self._chains.save_run_step(nxt)

    async def _fail_step(
        self,
        run: ChainRun,
        step: ChainRunStep,
        steps: list[ChainRunStep],
        execution: AgentExecution,
    ) -> None:
        step.status = ChainRunStepStatus.FAILED
        step.result = execution.result
        step.error_code = execution.error_code
        step.error_message = execution.error_message
        await self._chains.save_run_step(step)
        await self._fail_run(
            run,
            steps,
            error_code=execution.error_code,
            error_message=execution.error_message,
        )

    async def _fail_run(
        self,
        run: ChainRun,
        steps: list[ChainRunStep],
        *,
        error_code: str | None,
        error_message: str | None,
    ) -> None:
        for item in steps:
            if item.status in {ChainRunStepStatus.PENDING, ChainRunStepStatus.QUEUED} and (
                item.execution_id is None
            ):
                item.status = ChainRunStepStatus.SKIPPED
                await self._chains.save_run_step(item)
        run.status = ChainRunStatus.FAILED
        run.error_code = error_code
        run.error_message = error_message
        run.finished_at = datetime.now(UTC)
        await self._chains.save_run(run)


async def notify_execution_terminal(
    session: AsyncSession,
    execution: AgentExecution,
    settings: Settings,
) -> None:
    """Used by the worker when a run fails without the callback path."""
    executions = ExecutionService(
        SqlAlchemyExecutionRepository(session),
        SqlAlchemyAgentRepository(session),
    )
    orchestrator = ChainOrchestrator(
        SqlAlchemyChainRepository(session),
        executions,
        settings,
    )
    await orchestrator.on_execution_terminal(execution)
