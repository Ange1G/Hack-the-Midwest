import uuid

from app.common.pagination import clamp_page_size
from app.core.auth import CurrentUser, ensure_caller_owns
from app.core.config import Settings
from app.core.exceptions import AppError, NotFoundError
from app.domains.agents.repository import AgentRepository
from app.domains.chains.models import (
    AgentChain,
    AgentChainStep,
    ChainRun,
    ChainRunStatus,
    ChainRunStep,
    ChainRunStepStatus,
)
from app.domains.chains.orchestrator import ChainOrchestrator
from app.domains.chains.repository import ChainRepository
from app.domains.chains.schemas import (
    ChainCreate,
    ChainRead,
    ChainRunRead,
    ChainRunStepRead,
    ChainSchedule,
    ChainStepRead,
)
from app.domains.executions.schemas import ExecutionCreate
from app.domains.executions.service import ExecutionService


class ChainService:
    def __init__(
        self,
        chains: ChainRepository,
        agents: AgentRepository,
        executions: ExecutionService,
    ) -> None:
        self._chains = chains
        self._agents = agents
        self._executions = executions

    async def create(
        self,
        owner_user_sso: str,
        body: ChainCreate,
        *,
        caller: CurrentUser,
        settings: Settings,
    ) -> ChainRead:
        ensure_caller_owns(owner_user_sso, caller)
        if len(body.steps) > settings.max_chain_steps:
            raise _invalid_chain(
                [
                    {
                        "field": "steps",
                        "message": f"A chain may have at most {settings.max_chain_steps} steps",
                    }
                ]
            )
        errors = await self._agent_reference_errors(owner_user_sso, body)
        if errors:
            raise _invalid_chain(errors)
        schedule = _stored_schedule(body.schedule)
        steps = [
            AgentChainStep(position=index, agent_id=step.agent_id, label=step.label)
            for index, step in enumerate(body.steps)
        ]
        created = await self._chains.create(
            AgentChain(
                owner_user_sso=caller.user_sso,
                title=body.title,
                schedule=schedule,
            ),
            steps,
        )
        return self._to_read(created, steps)

    async def get(
        self,
        owner_user_sso: str,
        chain_id: uuid.UUID,
        *,
        caller: CurrentUser,
    ) -> ChainRead:
        ensure_caller_owns(owner_user_sso, caller)
        chain = await self._chains.get_owned(owner_user_sso, chain_id)
        if chain is None:
            raise NotFoundError("Chain not found")
        steps = await self._chains.list_steps(chain.id)
        return self._to_read(chain, steps)

    async def list_for_owner(
        self,
        owner_user_sso: str,
        *,
        page: int,
        page_size: int,
        caller: CurrentUser,
        settings: Settings,
    ) -> tuple[list[ChainRead], int, int, int]:
        ensure_caller_owns(owner_user_sso, caller)
        bounded_page_size = clamp_page_size(page_size, settings.max_page_size)
        rows, total_items = await self._chains.list_by_owner(
            owner_user_sso, page=page, page_size=bounded_page_size
        )
        items = [
            self._to_read(row, await self._chains.list_steps(row.id)) for row in rows
        ]
        return items, total_items, page, bounded_page_size

    async def delete(
        self,
        owner_user_sso: str,
        chain_id: uuid.UUID,
        *,
        caller: CurrentUser,
    ) -> None:
        ensure_caller_owns(owner_user_sso, caller)
        deleted = await self._chains.delete_owned(owner_user_sso, chain_id)
        if not deleted:
            raise NotFoundError("Chain not found")

    async def enqueue_run(
        self,
        owner_user_sso: str,
        chain_id: uuid.UUID,
        *,
        caller: CurrentUser,
        settings: Settings,
        body: ExecutionCreate | None = None,
        trigger: str = "api",
    ) -> ChainRunRead:
        ensure_caller_owns(owner_user_sso, caller)
        chain = await self._chains.get_owned(owner_user_sso, chain_id)
        if chain is None:
            raise NotFoundError("Chain not found")
        definition = await self._chains.list_steps(chain.id)
        if not definition:
            raise _invalid_chain([{"field": "steps", "message": "Chain has no steps"}])
        run_input = body.input if body is not None else None
        pending = [
            ChainRunStep(
                position=step.position,
                agent_id=step.agent_id,
                label=step.label,
                status=ChainRunStepStatus.PENDING,
            )
            for step in definition
        ]
        created = await self._chains.create_run(
            ChainRun(
                chain_id=chain.id,
                owner_user_sso=caller.user_sso,
                status=ChainRunStatus.RUNNING,
                input=run_input,
                trigger=trigger,
            ),
            pending,
        )
        steps = await self._chains.list_run_steps(created.id)
        first = steps[0]
        try:
            execution = await self._executions.enqueue(
                owner_user_sso,
                first.agent_id,
                caller=caller,
                settings=settings,
                body=body,
            )
        except AppError:
            created.status = ChainRunStatus.FAILED
            created.error_code = "enqueue_failed"
            created.error_message = "Could not enqueue the first chain step"
            first.status = ChainRunStepStatus.FAILED
            for later in steps[1:]:
                later.status = ChainRunStepStatus.SKIPPED
                await self._chains.save_run_step(later)
            await self._chains.save_run_step(first)
            await self._chains.save_run(created)
            raise
        first.status = ChainRunStepStatus.QUEUED
        first.execution_id = execution.id
        first.input = run_input
        await self._chains.save_run_step(first)
        return self._run_read(created)

    async def get_run(
        self,
        owner_user_sso: str,
        run_id: uuid.UUID,
        *,
        caller: CurrentUser,
    ) -> ChainRunRead:
        ensure_caller_owns(owner_user_sso, caller)
        run = await self._chains.get_run_owned(owner_user_sso, run_id)
        if run is None:
            raise NotFoundError("Chain run not found")
        return self._run_read(run)

    async def list_run_steps(
        self,
        owner_user_sso: str,
        run_id: uuid.UUID,
        *,
        caller: CurrentUser,
    ) -> list[ChainRunStepRead]:
        ensure_caller_owns(owner_user_sso, caller)
        run = await self._chains.get_run_owned(owner_user_sso, run_id)
        if run is None:
            raise NotFoundError("Chain run not found")
        steps = await self._chains.list_run_steps(run.id)
        return [
            ChainRunStepRead(
                position=step.position,
                agent_id=step.agent_id,
                label=step.label,
                status=step.status,
                execution_id=step.execution_id,
                input=step.input,
                result=step.result,
                error_code=step.error_code,
                error_message=step.error_message,
            )
            for step in steps
        ]

    def orchestrator(self, settings: Settings) -> ChainOrchestrator:
        return ChainOrchestrator(self._chains, self._executions, settings)

    def _run_read(self, run: ChainRun) -> ChainRunRead:
        return ChainRunRead(
            id=run.id,
            chain_id=run.chain_id,
            owner_user_sso=run.owner_user_sso,
            status=run.status,
            input=run.input,
            trigger=run.trigger,
            final_result=run.final_result,
            error_code=run.error_code,
            error_message=run.error_message,
            started_at=run.started_at,
            finished_at=run.finished_at,
            created_at=run.created_at,
            updated_at=run.updated_at,
        )

    async def _agent_reference_errors(
        self, owner_user_sso: str, body: ChainCreate
    ) -> list[dict[str, str]]:
        errors: list[dict[str, str]] = []
        seen: set[uuid.UUID] = set()
        for index, step in enumerate(body.steps):
            if step.agent_id in seen:
                continue
            seen.add(step.agent_id)
            agent = await self._agents.get_owned(owner_user_sso, step.agent_id)
            if agent is None:
                errors.append(
                    {
                        "field": f"steps.{index}.agent_id",
                        "message": "Agent not found",
                    }
                )
        return errors

    def _to_read(self, chain: AgentChain, steps: list[AgentChainStep]) -> ChainRead:
        return ChainRead(
            id=chain.id,
            owner_user_sso=chain.owner_user_sso,
            title=chain.title,
            schedule=chain.schedule,
            steps=[
                ChainStepRead(
                    position=step.position,
                    agent_id=step.agent_id,
                    label=step.label,
                )
                for step in steps
            ],
            created_at=chain.created_at,
            updated_at=chain.updated_at,
        )


def _stored_schedule(schedule: ChainSchedule | None) -> dict | None:
    if schedule is None:
        return None
    dumped = schedule.model_dump(mode="json", by_alias=True, exclude_none=True)
    if not dumped.get("month") and not dumped.get("dayOfWeek") and not dumped.get("timeOfDay"):
        return None
    return dumped


def _invalid_chain(errors: list[dict[str, str]]) -> AppError:
    return AppError(
        code="invalid_chain",
        message="Chain definition is invalid",
        status_code=422,
        details={"errors": errors},
    )
