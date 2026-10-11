import uuid
from datetime import UTC, datetime

import pytest

from app.core.auth import CurrentUser
from app.core.config import Settings
from app.domains.agents.models import Agent
from app.domains.chains.models import AgentChain, AgentChainStep, ChainRun, ChainRunStep
from app.domains.chains.orchestrator import ChainOrchestrator
from app.domains.chains.schemas import ChainCreate, ChainStepCreate
from app.domains.chains.service import ChainService
from app.domains.executions.models import AgentExecution, ExecutionStatus
from app.domains.executions.schemas import ExecutionCreate, ExecutionRead

ME = CurrentUser(user_sso="sso-me")
AGENT_A = uuid.uuid4()
AGENT_B = uuid.uuid4()
AGENT_C = uuid.uuid4()
SETTINGS = Settings(
    app_env="test",
    max_active_executions_per_owner=10,
    max_chain_steps=10,
    max_chain_handoff_bytes=20_000,
)


def _now() -> datetime:
    return datetime.now(UTC)


def _agent(agent_id: uuid.UUID) -> Agent:
    return Agent(
        id=agent_id,
        title="Step",
        system_prompt="Do work",
        configurations={"primitives": {}},
        owner_user_sso="sso-me",
        created_at=_now(),
        updated_at=_now(),
    )


class FakeAgents:
    def __init__(self, agents: list[Agent]) -> None:
        self._agents = agents

    async def get_owned(self, owner_user_sso: str, agent_id: uuid.UUID) -> Agent | None:
        for agent in self._agents:
            if agent.id == agent_id and agent.owner_user_sso == owner_user_sso:
                return agent
        return None


class FakeChains:
    def __init__(self) -> None:
        self.rows: dict[uuid.UUID, AgentChain] = {}
        self.steps: dict[uuid.UUID, list[AgentChainStep]] = {}
        self.runs: dict[uuid.UUID, ChainRun] = {}
        self.run_steps: dict[uuid.UUID, list[ChainRunStep]] = {}

    async def create(self, chain: AgentChain, steps: list[AgentChainStep]) -> AgentChain:
        chain.id = uuid.uuid4()
        chain.created_at = _now()
        chain.updated_at = _now()
        self.rows[chain.id] = chain
        for index, step in enumerate(steps):
            step.id = uuid.uuid4()
            step.chain_id = chain.id
            step.position = index
        self.steps[chain.id] = steps
        return chain

    async def get_owned(self, owner_user_sso: str, chain_id: uuid.UUID) -> AgentChain | None:
        chain = self.rows.get(chain_id)
        if chain is None or chain.owner_user_sso != owner_user_sso:
            return None
        return chain

    async def list_steps(self, chain_id: uuid.UUID) -> list[AgentChainStep]:
        return list(self.steps.get(chain_id, []))

    async def list_by_owner(self, owner_user_sso: str, *, page: int, page_size: int):
        items = [row for row in self.rows.values() if row.owner_user_sso == owner_user_sso]
        return items, len(items)

    async def delete_owned(self, owner_user_sso: str, chain_id: uuid.UUID) -> bool:
        return False

    async def create_run(self, run: ChainRun, steps: list[ChainRunStep]) -> ChainRun:
        run.id = uuid.uuid4()
        now = _now()
        run.created_at = now
        run.updated_at = now
        run.started_at = now
        if not getattr(run, "trigger", None):
            run.trigger = "api"
        self.runs[run.id] = run
        for step in steps:
            step.id = uuid.uuid4()
            step.chain_run_id = run.id
        self.run_steps[run.id] = steps
        return run

    async def get_run_owned(self, owner_user_sso: str, run_id: uuid.UUID) -> ChainRun | None:
        run = self.runs.get(run_id)
        if run is None or run.owner_user_sso != owner_user_sso:
            return None
        return run

    async def get_run(self, run_id: uuid.UUID) -> ChainRun | None:
        return self.runs.get(run_id)

    async def list_run_steps(self, run_id: uuid.UUID) -> list[ChainRunStep]:
        return sorted(self.run_steps.get(run_id, []), key=lambda step: step.position)

    async def get_run_step_by_execution(self, execution_id: uuid.UUID) -> ChainRunStep | None:
        for steps in self.run_steps.values():
            for step in steps:
                if step.execution_id == execution_id:
                    return step
        return None

    async def save_run(self, run: ChainRun) -> ChainRun:
        self.runs[run.id] = run
        return run

    async def save_run_step(self, step: ChainRunStep) -> ChainRunStep:
        return step


class FakeExecutionService:
    def __init__(self) -> None:
        self.enqueued: list[tuple[uuid.UUID, str | None]] = []

    async def enqueue(
        self,
        owner_user_sso: str,
        agent_id: uuid.UUID,
        *,
        caller: CurrentUser,
        settings: Settings,
        body: ExecutionCreate | None = None,
    ) -> ExecutionRead:
        now = _now()
        execution = AgentExecution(
            id=uuid.uuid4(),
            agent_id=agent_id,
            owner_user_sso=owner_user_sso,
            status=ExecutionStatus.QUEUED.value,
            input=body.input if body is not None else None,
            result=None,
            error_code=None,
            error_message=None,
            runner_meta=None,
            started_at=None,
            finished_at=None,
            created_at=now,
            updated_at=now,
        )
        self.enqueued.append((agent_id, execution.input))
        return ExecutionRead.model_validate(execution)


def _service() -> tuple[ChainService, FakeChains, FakeExecutionService]:
    chains = FakeChains()
    executions = FakeExecutionService()
    service = ChainService(
        chains,
        FakeAgents([_agent(AGENT_A), _agent(AGENT_B), _agent(AGENT_C)]),
        executions,
    )
    return service, chains, executions


async def _create_chain(service: ChainService, *agent_ids: uuid.UUID) -> uuid.UUID:
    created = await service.create(
        "sso-me",
        ChainCreate(
            title="Pipeline",
            steps=[ChainStepCreate(agent_id=agent_id) for agent_id in agent_ids],
        ),
        caller=ME,
        settings=SETTINGS,
    )
    return created.id


def _execution(
    *,
    agent_id: uuid.UUID,
    status: str,
    result=None,
    error_code=None,
    execution_id: uuid.UUID | None = None,
) -> AgentExecution:
    now = _now()
    return AgentExecution(
        id=execution_id or uuid.uuid4(),
        agent_id=agent_id,
        owner_user_sso="sso-me",
        status=status,
        input="start",
        result=result,
        error_code=error_code,
        error_message=None,
        runner_meta=None,
        started_at=now,
        finished_at=now,
        created_at=now,
        updated_at=now,
    )


async def test_enqueue_run_starts_first_step_only() -> None:
    service, _, executions = _service()
    chain_id = await _create_chain(service, AGENT_A, AGENT_B)
    run = await service.enqueue_run(
        "sso-me",
        chain_id,
        caller=ME,
        settings=SETTINGS,
        body=ExecutionCreate(input="ticket INC-1"),
    )
    assert run.status == "running"
    assert run.input == "ticket INC-1"
    assert run.final_result is None
    assert [item[0] for item in executions.enqueued] == [AGENT_A]
    assert executions.enqueued[0][1] == "ticket INC-1"


async def test_success_handoff_enqueues_next_then_finalizes() -> None:
    service, chains, executions = _service()
    chain_id = await _create_chain(service, AGENT_A, AGENT_B)
    run = await service.enqueue_run("sso-me", chain_id, caller=ME, settings=SETTINGS)
    first_id = chains.run_steps[run.id][0].execution_id
    assert first_id is not None

    orchestrator = ChainOrchestrator(chains, executions, SETTINGS)
    await orchestrator.on_execution_terminal(
        _execution(
            execution_id=first_id,
            agent_id=AGENT_A,
            status=ExecutionStatus.SUCCEEDED.value,
            result={"output": "from-a", "tool_calls": [{"name": "http"}]},
        )
    )
    assert chains.runs[run.id].status == "running"
    assert executions.enqueued[1][0] == AGENT_B
    assert executions.enqueued[1][1] is not None
    assert "from-a" in executions.enqueued[1][1]

    second_id = chains.run_steps[run.id][1].execution_id
    assert second_id is not None
    await orchestrator.on_execution_terminal(
        _execution(
            execution_id=second_id,
            agent_id=AGENT_B,
            status=ExecutionStatus.SUCCEEDED.value,
            result={"output": "from-b"},
        )
    )
    assert chains.runs[run.id].status == "succeeded"
    assert chains.runs[run.id].final_result == {"output": "from-b"}
    assert len(executions.enqueued) == 2


async def test_failed_step_fails_chain_and_skips_later() -> None:
    service, chains, executions = _service()
    chain_id = await _create_chain(service, AGENT_A, AGENT_B, AGENT_C)
    run = await service.enqueue_run("sso-me", chain_id, caller=ME, settings=SETTINGS)
    first_id = chains.run_steps[run.id][0].execution_id
    assert first_id is not None

    await ChainOrchestrator(chains, executions, SETTINGS).on_execution_terminal(
        _execution(
            execution_id=first_id,
            agent_id=AGENT_A,
            status=ExecutionStatus.FAILED.value,
            error_code="boom",
        )
    )
    assert chains.runs[run.id].status == "failed"
    assert [step.status for step in chains.run_steps[run.id]] == [
        "failed",
        "skipped",
        "skipped",
    ]
    assert len(executions.enqueued) == 1


async def test_unrelated_execution_is_ignored() -> None:
    service, chains, executions = _service()
    await _create_chain(service, AGENT_A)
    await ChainOrchestrator(chains, executions, SETTINGS).on_execution_terminal(
        _execution(agent_id=AGENT_A, status=ExecutionStatus.SUCCEEDED.value, result={"output": "x"})
    )
    assert executions.enqueued == []
