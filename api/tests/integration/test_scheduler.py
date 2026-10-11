from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session_factory
from app.domains.agents.models import Agent
from app.domains.chains.models import AgentChain, AgentChainStep, ChainRun
from app.domains.executions.models import AgentExecution
from app.scheduler.loop import process_once

OWNER = "sso-user-a"
MONDAY_0900 = datetime(2026, 10, 12, 9, 0, tzinfo=UTC)


async def _agent(
    db_session: AsyncSession, *, title: str, configurations: dict
) -> Agent:
    agent = Agent(
        title=title,
        system_prompt="Summarize",
        configurations=configurations,
        owner_user_sso=OWNER,
    )
    db_session.add(agent)
    await db_session.commit()
    await db_session.refresh(agent)
    return agent


async def _execution_count(db_session: AsyncSession, agent_id) -> int:
    result = await db_session.execute(
        select(func.count())
        .select_from(AgentExecution)
        .where(AgentExecution.agent_id == agent_id)
    )
    return int(result.scalar_one())


async def test_scheduler_enqueues_matching_agent_once(
    db_session: AsyncSession,
) -> None:
    scheduled = await _agent(
        db_session,
        title="Weekday digest",
        configurations={"primitives": {}, "dayOfWeek": [1], "timeOfDay": [540]},
    )
    idle = await _agent(
        db_session,
        title="Manual only",
        configurations={"primitives": {}},
    )
    settings = get_settings()

    scheduled_id, idle_id = scheduled.id, idle.id
    first = await process_once(get_session_factory(), settings, now=MONDAY_0900)
    second = await process_once(get_session_factory(), settings, now=MONDAY_0900)

    assert first == 1
    assert second == 0
    assert await _execution_count(db_session, scheduled_id) == 1
    assert await _execution_count(db_session, idle_id) == 0


async def test_scheduler_skips_wrong_weekday(db_session: AsyncSession) -> None:
    agent = await _agent(
        db_session,
        title="Sunday only",
        configurations={"primitives": {}, "dayOfWeek": [0], "timeOfDay": [540]},
    )
    agent_id = agent.id
    fired = await process_once(get_session_factory(), get_settings(), now=MONDAY_0900)
    assert fired == 0
    assert await _execution_count(db_session, agent_id) == 0


async def test_scheduler_enqueues_matching_chain_once(db_session: AsyncSession) -> None:
    agent = await _agent(
        db_session,
        title="Step",
        configurations={"primitives": {}},
    )
    chain = AgentChain(
        owner_user_sso=OWNER,
        title="Nightly",
        schedule={"dayOfWeek": [1], "timeOfDay": [540]},
    )
    db_session.add(chain)
    await db_session.flush()
    db_session.add(AgentChainStep(chain_id=chain.id, position=0, agent_id=agent.id))
    await db_session.commit()
    await db_session.refresh(chain)
    chain_id = chain.id
    settings = get_settings()

    first = await process_once(get_session_factory(), settings, now=MONDAY_0900)
    second = await process_once(get_session_factory(), settings, now=MONDAY_0900)
    assert first == 1
    assert second == 0
    result = await db_session.execute(select(ChainRun).where(ChainRun.chain_id == chain_id))
    runs = list(result.scalars().all())
    assert len(runs) == 1
    assert runs[0].trigger == "scheduler"
