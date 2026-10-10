import asyncio
import logging
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.domains.agents.repository import SqlAlchemyAgentRepository
from app.domains.executions.models import ExecutionStatus
from app.domains.executions.repository import SqlAlchemyExecutionRepository, is_terminal
from app.domains.executions.service import agent_manifest
from app.domains.executions.tokens import generate_callback_token, hash_callback_token
from app.worker.runner import ContainerRunner, RunOutcome, RunRequest

logger = logging.getLogger(__name__)

CALLBACK_PATH = "/api/v1/internal/executions/{execution_id}/complete"


@dataclass(frozen=True)
class ClaimedJob:
    execution_id: uuid.UUID
    agent_id: uuid.UUID
    owner_user_sso: str
    callback_token: str
    manifest: dict[str, Any]


async def process_once(
    session_factory: async_sessionmaker[AsyncSession],
    runner: ContainerRunner,
    settings: Settings,
) -> bool:
    claimed = await _claim(session_factory)
    if claimed is None:
        return False

    request = RunRequest(
        execution_id=claimed.execution_id,
        agent_id=claimed.agent_id,
        owner_user_sso=claimed.owner_user_sso,
        callback_url=_callback_url(settings, claimed.execution_id),
        callback_token=claimed.callback_token,
        agent_manifest=claimed.manifest,
        timeout_seconds=settings.execution_timeout_seconds,
        image=settings.execution_stub_image,
    )
    try:
        outcome = await runner.run(request)
    except Exception:
        logger.exception("container runner failed execution_id=%s", claimed.execution_id)
        outcome = RunOutcome(
            exit_code=1,
            timed_out=False,
            runner_meta={"error": "runner_error"},
        )
    await _reconcile(session_factory, claimed.execution_id, outcome)
    return True


async def run_forever(
    session_factory: async_sessionmaker[AsyncSession],
    runner: ContainerRunner,
    settings: Settings,
) -> None:
    while True:
        claimed = await process_once(session_factory, runner, settings)
        if not claimed:
            await asyncio.sleep(settings.worker_poll_interval_seconds)


async def _claim(session_factory: async_sessionmaker[AsyncSession]) -> ClaimedJob | None:
    token = generate_callback_token()
    async with session_factory() as session:
        executions = SqlAlchemyExecutionRepository(session)
        agents = SqlAlchemyAgentRepository(session)
        execution = await executions.claim_next(hash_callback_token(token))
        if execution is None:
            return None
        agent = await agents.get_owned(execution.owner_user_sso, execution.agent_id)
        if agent is None:
            await executions.fail_if_running(
                execution.id,
                status=ExecutionStatus.FAILED.value,
                error_code="agent_missing",
                error_message="Agent was not found when the run was claimed",
            )
            return None
        return ClaimedJob(
            execution_id=execution.id,
            agent_id=agent.id,
            owner_user_sso=execution.owner_user_sso,
            callback_token=token,
            manifest=agent_manifest(agent),
        )


async def _reconcile(
    session_factory: async_sessionmaker[AsyncSession],
    execution_id: uuid.UUID,
    outcome: RunOutcome,
) -> None:
    async with session_factory() as session:
        executions = SqlAlchemyExecutionRepository(session)
        current = await executions.get_by_id(execution_id)
        if current is None:
            return
        if is_terminal(current.status):
            if outcome.runner_meta:
                await executions.merge_runner_meta(current.id, outcome.runner_meta)
            return
        if outcome.timed_out:
            await executions.fail_if_running(
                current.id,
                status=ExecutionStatus.TIMED_OUT.value,
                error_code="timed_out",
                error_message="Execution timed out",
                runner_meta=outcome.runner_meta,
            )
            return
        if outcome.exit_code not in (0, None):
            await executions.fail_if_running(
                current.id,
                status=ExecutionStatus.FAILED.value,
                error_code="container_exit",
                error_message=f"Container exited with code {outcome.exit_code}",
                runner_meta=outcome.runner_meta,
            )
            return
        await executions.fail_if_running(
            current.id,
            status=ExecutionStatus.FAILED.value,
            error_code="callback_missing",
            error_message="Container finished without posting a result",
            runner_meta=outcome.runner_meta,
        )


def _callback_url(settings: Settings, execution_id: uuid.UUID) -> str:
    base = settings.execution_callback_base_url.rstrip("/")
    return f"{base}{CALLBACK_PATH.format(execution_id=execution_id)}"
