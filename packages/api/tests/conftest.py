"""Test configuration — uses in-memory SQLite instead of Postgres."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import db
from agents.seed import SEED_AGENTS


@pytest.fixture(autouse=True)
async def test_db():
    """Replace the database with an in-memory SQLite instance for each test."""
    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    test_session_factory = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False,
    )

    # Create all tables
    async with test_engine.begin() as conn:
        await conn.run_sync(db.Base.metadata.create_all)

    # Seed demo agents
    async with test_session_factory() as session:
        for agent_data in SEED_AGENTS:
            row = db.AgentRow(
                id=agent_data["id"],
                name=agent_data["name"],
                role=agent_data["role"],
                departments=agent_data["departments"],
                knowledge_areas=agent_data["knowledge_areas"],
                knowledge_base=agent_data["knowledge_base"],
                scopes=agent_data["scopes"],
                is_active=True,
            )
            session.add(row)
        await session.commit()

    # Swap out the module-level engine and session factory
    original_engine = db.engine
    original_session = db.async_session
    db.engine = test_engine
    db.async_session = test_session_factory

    yield

    db.engine = original_engine
    db.async_session = original_session
    await test_engine.dispose()
