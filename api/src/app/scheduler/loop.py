import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.auth import CurrentUser
from app.core.config import Settings
from app.core.exceptions import AppError
from app.domains.agents.configurations import AgentConfigurations
from app.domains.agents.models import Agent
from app.domains.agents.repository import SqlAlchemyAgentRepository
from app.domains.chains.models import AgentChain
from app.domains.chains.repository import SqlAlchemyChainRepository
from app.domains.chains.schemas import ChainSchedule
from app.domains.chains.service import ChainService
from app.domains.executions.repository import SqlAlchemyExecutionRepository
from app.domains.executions.service import ExecutionService
from app.scheduler.match import matching_slot
from app.scheduler.repository import SchedulerRepository

logger = logging.getLogger(__name__)

AGENT_PAGE_SIZE = 100
Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(UTC)


async def process_once(
    session_factory: async_sessionmaker[AsyncSession],
    settings: Settings,
    *,
    now: datetime | None = None,
) -> int:
    """Scan agents and chains whose schedule matches `now`. Returns enqueue count."""
    instant = now or utc_now()
    enqueued = 0
    enqueued += await _scan_agents(session_factory, settings, instant)
    enqueued += await _scan_chains(session_factory, settings, instant)
    return enqueued


async def run_forever(
    session_factory: async_sessionmaker[AsyncSession],
    settings: Settings,
) -> None:
    while True:
        try:
            fired = await process_once(session_factory, settings)
            if fired:
                logger.info("scheduler enqueued %s execution(s)", fired)
        except Exception:
            logger.exception("scheduler poll failed")
        await asyncio.sleep(settings.scheduler_poll_interval_seconds)


async def _scan_agents(
    session_factory: async_sessionmaker[AsyncSession],
    settings: Settings,
    now: datetime,
) -> int:
    enqueued = 0
    page = 1
    while True:
        async with session_factory() as session:
            repo = SchedulerRepository(session)
            agents = await repo.list_agents(page=page, page_size=AGENT_PAGE_SIZE)
        if not agents:
            return enqueued
        for agent in agents:
            if await _maybe_enqueue_agent(session_factory, settings, agent, now):
                enqueued += 1
        if len(agents) < AGENT_PAGE_SIZE:
            return enqueued
        page += 1


async def _scan_chains(
    session_factory: async_sessionmaker[AsyncSession],
    settings: Settings,
    now: datetime,
) -> int:
    enqueued = 0
    page = 1
    while True:
        async with session_factory() as session:
            repo = SchedulerRepository(session)
            chains = await repo.list_chains(page=page, page_size=AGENT_PAGE_SIZE)
        if not chains:
            return enqueued
        for chain in chains:
            if await _maybe_enqueue_chain(session_factory, settings, chain, now):
                enqueued += 1
        if len(chains) < AGENT_PAGE_SIZE:
            return enqueued
        page += 1


async def _maybe_enqueue_agent(
    session_factory: async_sessionmaker[AsyncSession],
    settings: Settings,
    agent: Agent,
    now: datetime,
) -> bool:
    try:
        configurations = AgentConfigurations.model_validate(agent.configurations or {})
    except ValidationError:
        return False
    slot = matching_slot(configurations, now, settings.scheduler_timezone)
    if slot is None:
        return False

    async with session_factory() as session:
        scheduler = SchedulerRepository(session)
        if not await scheduler.try_claim_slot(agent.id, slot):
            return False
        try:
            service = ExecutionService(
                SqlAlchemyExecutionRepository(session),
                SqlAlchemyAgentRepository(session),
            )
            await service.enqueue(
                agent.owner_user_sso,
                agent.id,
                caller=CurrentUser(user_sso=agent.owner_user_sso),
                settings=settings,
            )
        except AppError as exc:
            await scheduler.release_slot(agent.id, slot)
            logger.info(
                "scheduler skipped agent_id=%s slot=%s: %s",
                agent.id,
                slot,
                exc.message,
            )
            return False
        except Exception:
            await scheduler.release_slot(agent.id, slot)
            logger.exception("scheduler enqueue failed agent_id=%s", agent.id)
            return False
        return True


async def _maybe_enqueue_chain(
    session_factory: async_sessionmaker[AsyncSession],
    settings: Settings,
    chain: AgentChain,
    now: datetime,
) -> bool:
    try:
        schedule = ChainSchedule.model_validate(chain.schedule or {})
    except ValidationError:
        return False
    slot = matching_slot(schedule, now, settings.scheduler_timezone)
    if slot is None:
        return False

    async with session_factory() as session:
        scheduler = SchedulerRepository(session)
        if not await scheduler.try_claim_chain_slot(chain.id, slot):
            return False
        try:
            agents = SqlAlchemyAgentRepository(session)
            executions = ExecutionService(SqlAlchemyExecutionRepository(session), agents)
            chains = ChainService(SqlAlchemyChainRepository(session), agents, executions)
            executions.set_terminal_hook(chains.orchestrator(settings).on_execution_terminal)
            await chains.enqueue_run(
                chain.owner_user_sso,
                chain.id,
                caller=CurrentUser(user_sso=chain.owner_user_sso),
                settings=settings,
                trigger="scheduler",
            )
        except AppError as exc:
            await scheduler.release_chain_slot(chain.id, slot)
            logger.info(
                "scheduler skipped chain_id=%s slot=%s: %s",
                chain.id,
                slot,
                exc.message,
            )
            return False
        except Exception:
            await scheduler.release_chain_slot(chain.id, slot)
            logger.exception("scheduler enqueue failed chain_id=%s", chain.id)
            return False
        return True
