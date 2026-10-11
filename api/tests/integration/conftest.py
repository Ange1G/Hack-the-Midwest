from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import Base, get_engine, get_session_factory, reset_database_state
from app.domains.agents.models import Agent
from app.domains.connectors.models import Connector
from app.main import create_app


@pytest.fixture(autouse=True)
def _configure_test_env() -> None:
    get_settings.cache_clear()
    reset_database_state()


@pytest.fixture(autouse=True)
async def database_harness() -> AsyncGenerator[None]:
    engine = get_engine()
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        session_factory = get_session_factory()
        async with session_factory() as session:
            await session.execute(delete(Agent))
            await session.commit()
    except Exception as exc:
        pytest.skip(f"PostgreSQL unavailable for integration tests: {exc}")
    yield


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession]:
    session_factory = get_session_factory()
    async with session_factory() as session:
        yield session
        await session.rollback()


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient]:
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def seeded_agents(db_session: AsyncSession) -> dict[str, list[Agent]]:
    owner_a = "sso-user-a"
    owner_b = "sso-user-b"
    agents_a = [
        Agent(
            title=f"Agent A{i}",
            system_prompt="prompt",
            configurations={"tools": ["HTTP.GET"]},
            owner_user_sso=owner_a,
        )
        for i in range(3)
    ]
    agents_b = [
        Agent(
            title="Agent B0",
            system_prompt="prompt",
            configurations={},
            owner_user_sso=owner_b,
        )
    ]
    for agent in agents_a + agents_b:
        db_session.add(agent)
    await db_session.commit()
    for agent in agents_a + agents_b:
        await db_session.refresh(agent)
    return {owner_a: agents_a, owner_b: agents_b}


@pytest.fixture(autouse=True)
async def _clean_connectors(
    _configure_test_env: None, database_harness: None
) -> AsyncGenerator[None]:
    """Connectors are unique per owner and name, so each test starts without any.

    Depends on _configure_test_env explicitly so the per-test engine reset runs first;
    otherwise this fixture would reuse an engine bound to the previous test's loop.
    """
    session_factory = get_session_factory()
    async with session_factory() as session:
        await session.execute(delete(Connector))
        await session.commit()
    yield
