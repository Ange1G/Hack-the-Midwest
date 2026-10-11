import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.domains.agents.models import Agent
from app.domains.agents.repository import SqlAlchemyAgentRepository
from app.domains.connectors.repository import SqlAlchemyConnectorRepository
from app.domains.executions.models import ExecutionStatus
from app.domains.executions.repository import SqlAlchemyExecutionRepository, is_terminal
from app.domains.executions.service import agent_manifest
from app.domains.executions.tokens import generate_callback_token, hash_callback_token
from app.worker.bundle import (
    BundleBuildError,
    HttpToolBundle,
    build_http_tool_bundle,
    cipher_from_settings,
    referenced_connector_ids,
)
from app.worker.runner import ContainerRunner, RunOutcome, RunRequest


def platform_openai_key(settings: Settings) -> str | None:
    secret = settings.openai_api_key
    if secret is None:
        return None
    value = secret.get_secret_value().strip()
    return value or None


logger = logging.getLogger(__name__)

CALLBACK_PATH = "/api/v1/internal/executions/{execution_id}/complete"


@dataclass(frozen=True)
class ClaimedJob:
    execution_id: uuid.UUID
    agent_id: uuid.UUID
    owner_user_sso: str
    callback_token: str
    manifest: dict[str, Any]
    http_tools: list[dict[str, Any]] = field(default_factory=list)
    http_credentials: dict[str, dict[str, str]] = field(default_factory=dict)


async def process_once(
    session_factory: async_sessionmaker[AsyncSession],
    runner: ContainerRunner,
    settings: Settings,
) -> bool:
    claimed = await _claim(session_factory, settings)
    if claimed is None:
        return False

    openai_key = platform_openai_key(settings)
    if openai_key is None:
        await _fail_running(
            session_factory,
            claimed.execution_id,
            error_code="llm_unconfigured",
            error_message="OPENAI_API_KEY is not configured on the worker",
        )
        return True

    request = RunRequest(
        execution_id=claimed.execution_id,
        agent_id=claimed.agent_id,
        owner_user_sso=claimed.owner_user_sso,
        callback_url=_callback_url(settings, claimed.execution_id),
        callback_token=claimed.callback_token,
        agent_manifest=claimed.manifest,
        timeout_seconds=settings.execution_timeout_seconds,
        image=settings.execution_runner_image,
        openai_api_key=openai_key,
        openai_model=settings.openai_model,
        http_tools=claimed.http_tools,
        http_credentials=claimed.http_credentials or None,
        ssl_ca_bundle=settings.execution_ssl_ca_bundle or None,
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


async def _claim(
    session_factory: async_sessionmaker[AsyncSession], settings: Settings
) -> ClaimedJob | None:
    token = generate_callback_token()
    async with session_factory() as session:
        executions = SqlAlchemyExecutionRepository(session)
        agents = SqlAlchemyAgentRepository(session)
        connectors = SqlAlchemyConnectorRepository(session)
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
        try:
            bundle = await _http_bundle(agent, connectors, settings)
        except BundleBuildError as exc:
            await executions.fail_if_running(
                execution.id,
                status=ExecutionStatus.FAILED.value,
                error_code=exc.code,
                error_message=exc.message,
            )
            return None
        return ClaimedJob(
            execution_id=execution.id,
            agent_id=agent.id,
            owner_user_sso=execution.owner_user_sso,
            callback_token=token,
            manifest=agent_manifest(agent),
            http_tools=bundle.tools,
            http_credentials=bundle.credentials,
        )


async def _http_bundle(
    agent: Agent,
    connectors: SqlAlchemyConnectorRepository,
    settings: Settings,
) -> HttpToolBundle:
    ids = referenced_connector_ids(agent)
    owned = await connectors.get_with_secrets(agent.owner_user_sso, ids)
    return build_http_tool_bundle(agent, owned, cipher_from_settings(settings))


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


async def _fail_running(
    session_factory: async_sessionmaker[AsyncSession],
    execution_id: uuid.UUID,
    *,
    error_code: str,
    error_message: str,
) -> None:
    async with session_factory() as session:
        executions = SqlAlchemyExecutionRepository(session)
        await executions.fail_if_running(
            execution_id,
            status=ExecutionStatus.FAILED.value,
            error_code=error_code,
            error_message=error_message,
        )


def _callback_url(settings: Settings, execution_id: uuid.UUID) -> str:
    base = settings.execution_callback_base_url.rstrip("/")
    return f"{base}{CALLBACK_PATH.format(execution_id=execution_id)}"
