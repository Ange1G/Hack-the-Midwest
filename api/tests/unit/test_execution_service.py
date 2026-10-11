import uuid
from datetime import UTC, datetime

import pytest

from app.core.auth import CurrentUser
from app.core.config import Settings
from app.core.exceptions import AppError, ForbiddenError, NotFoundError, UnauthorizedError
from app.domains.agents.models import Agent
from app.domains.executions.models import AgentExecution, ExecutionStatus
from app.domains.executions.schemas import ExecutionComplete, ExecutionCreate
from app.domains.executions.service import ExecutionService
from app.domains.executions.tokens import hash_callback_token

ME = CurrentUser(user_sso="sso-me")
AGENT_ID = uuid.uuid4()
SETTINGS = Settings(app_env="test", max_active_executions_per_owner=5)


def _agent() -> Agent:
    now = datetime.now(UTC)
    return Agent(
        id=AGENT_ID,
        title="Digest",
        system_prompt="Summarize",
        configurations={"primitives": {}},
        owner_user_sso="sso-me",
        created_at=now,
        updated_at=now,
    )


class FakeAgents:
    def __init__(self, agents: list[Agent]) -> None:
        self._agents = agents

    async def list_by_owner(self, owner_user_sso: str, *, page: int, page_size: int):
        return [], 0

    async def create(self, agent: Agent) -> Agent:
        return agent

    async def get_owned(self, owner_user_sso: str, agent_id: uuid.UUID) -> Agent | None:
        for agent in self._agents:
            if agent.id == agent_id and agent.owner_user_sso == owner_user_sso:
                return agent
        return None


class FakeExecutions:
    def __init__(self) -> None:
        self.created: list[AgentExecution] = []
        self.rows: dict[uuid.UUID, AgentExecution] = {}

    async def create(self, execution: AgentExecution) -> AgentExecution:
        now = datetime.now(UTC)
        execution.id = uuid.uuid4()
        execution.created_at = now
        execution.updated_at = now
        self.created.append(execution)
        self.rows[execution.id] = execution
        return execution

    async def get_by_id(self, execution_id: uuid.UUID) -> AgentExecution | None:
        return self.rows.get(execution_id)

    async def get_owned(
        self, owner_user_sso: str, execution_id: uuid.UUID
    ) -> AgentExecution | None:
        row = self.rows.get(execution_id)
        if row is None or row.owner_user_sso != owner_user_sso:
            return None
        return row

    async def list_by_owner(self, owner_user_sso: str, *, page: int, page_size: int):
        items = [row for row in self.rows.values() if row.owner_user_sso == owner_user_sso]
        return items, len(items)

    async def count_active_by_owner(self, owner_user_sso: str) -> int:
        return sum(
            1
            for row in self.rows.values()
            if row.owner_user_sso == owner_user_sso
            and row.status in (ExecutionStatus.QUEUED.value, ExecutionStatus.RUNNING.value)
        )

    async def complete_if_running(
        self,
        execution_id: uuid.UUID,
        *,
        status: str,
        result: dict | None,
        error_code: str | None,
        error_message: str | None,
    ) -> AgentExecution | None:
        row = self.rows.get(execution_id)
        if row is None:
            return None
        if row.status == ExecutionStatus.RUNNING.value:
            row.status = status
            row.result = result
            row.error_code = error_code
            row.error_message = error_message
            row.finished_at = datetime.now(UTC)
        return row


async def test_enqueue_creates_queued_execution() -> None:
    executions = FakeExecutions()
    result = await ExecutionService(executions, FakeAgents([_agent()])).enqueue(
        "sso-me", AGENT_ID, caller=ME, settings=SETTINGS
    )
    assert result.status == "queued"
    assert result.agent_id == AGENT_ID
    assert result.owner_user_sso == "sso-me"
    assert executions.created[0].callback_token_hash is None
    assert executions.created[0].input is None


async def test_enqueue_persists_run_input() -> None:
    executions = FakeExecutions()
    result = await ExecutionService(executions, FakeAgents([_agent()])).enqueue(
        "sso-me",
        AGENT_ID,
        body=ExecutionCreate(input="Summarize yesterday"),
        caller=ME,
        settings=SETTINGS,
    )
    assert result.input == "Summarize yesterday"
    assert executions.created[0].input == "Summarize yesterday"


async def test_enqueue_forbidden_for_other_user() -> None:
    with pytest.raises(ForbiddenError):
        await ExecutionService(FakeExecutions(), FakeAgents([_agent()])).enqueue(
            "sso-other", AGENT_ID, caller=ME, settings=SETTINGS
        )


async def test_enqueue_missing_agent_is_not_found() -> None:
    with pytest.raises(NotFoundError):
        await ExecutionService(FakeExecutions(), FakeAgents([])).enqueue(
            "sso-me", AGENT_ID, caller=ME, settings=SETTINGS
        )


async def test_get_is_tenant_scoped() -> None:
    executions = FakeExecutions()
    service = ExecutionService(executions, FakeAgents([_agent()]))
    created = await service.enqueue("sso-me", AGENT_ID, caller=ME, settings=SETTINGS)
    fetched = await service.get("sso-me", created.id, caller=ME)
    assert fetched.id == created.id
    with pytest.raises(ForbiddenError):
        await service.get("sso-other", created.id, caller=ME)


async def test_complete_requires_callback_token() -> None:
    executions = FakeExecutions()
    service = ExecutionService(executions, FakeAgents([_agent()]))
    created = await service.enqueue("sso-me", AGENT_ID, caller=ME, settings=SETTINGS)
    row = executions.rows[created.id]
    row.status = ExecutionStatus.RUNNING.value
    row.callback_token_hash = hash_callback_token("secret")

    with pytest.raises(UnauthorizedError):
        await service.complete(
            created.id,
            ExecutionComplete(status="succeeded", result={"ok": True}),
            token="wrong",
        )
    with pytest.raises(UnauthorizedError):
        await service.complete(
            created.id,
            ExecutionComplete(status="succeeded", result={"ok": True}),
            token=None,
        )


async def test_complete_is_idempotent_when_already_terminal() -> None:
    executions = FakeExecutions()
    service = ExecutionService(executions, FakeAgents([_agent()]))
    created = await service.enqueue("sso-me", AGENT_ID, caller=ME, settings=SETTINGS)
    row = executions.rows[created.id]
    row.status = ExecutionStatus.SUCCEEDED.value
    row.result = {"message": "already done"}
    row.callback_token_hash = hash_callback_token("secret")

    again = await service.complete(
        created.id,
        ExecutionComplete(status="failed", error={"code": "x", "message": "nope"}),
        token="secret",
    )
    assert again.status == "succeeded"
    assert again.result == {"message": "already done"}


async def test_complete_persists_success() -> None:
    executions = FakeExecutions()
    service = ExecutionService(executions, FakeAgents([_agent()]))
    created = await service.enqueue("sso-me", AGENT_ID, caller=ME, settings=SETTINGS)
    row = executions.rows[created.id]
    row.status = ExecutionStatus.RUNNING.value
    row.callback_token_hash = hash_callback_token("secret")

    done = await service.complete(
        created.id,
        ExecutionComplete(status="succeeded", result={"message": "stub run complete"}),
        token="secret",
    )
    assert done.status == "succeeded"
    assert done.result == {"message": "stub run complete"}


async def test_list_clamps_page_size() -> None:
    executions = FakeExecutions()
    service = ExecutionService(executions, FakeAgents([_agent()]))
    await service.enqueue("sso-me", AGENT_ID, caller=ME, settings=SETTINGS)
    items, total, page, size = await service.list_for_owner(
        "sso-me",
        page=1,
        page_size=10_000,
        caller=ME,
        settings=Settings(app_env="test", max_page_size=50),
    )
    assert total == 1
    assert page == 1
    assert size == 50
    assert len(items) == 1


async def test_enqueue_rejects_when_active_limit_reached() -> None:
    executions = FakeExecutions()
    service = ExecutionService(executions, FakeAgents([_agent()]))
    tight = Settings(app_env="test", max_active_executions_per_owner=1)
    await service.enqueue("sso-me", AGENT_ID, caller=ME, settings=tight)
    with pytest.raises(AppError) as exc:
        await service.enqueue("sso-me", AGENT_ID, caller=ME, settings=tight)
    assert exc.value.status_code == 429
    assert exc.value.code == "too_many_executions"
