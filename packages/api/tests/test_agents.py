"""Basic agent tests."""

import pytest
from sqlalchemy import select

from agents.seed import SALES_AGENT_ID, FINANCE_AGENT_ID, SEED_AGENTS
import db
from db import AgentRow


def test_seed_data_exists():
    assert len(SEED_AGENTS) == 2


def test_sales_agent_seed():
    sales = next(a for a in SEED_AGENTS if a["id"] == SALES_AGENT_ID)
    assert sales["departments"] == ["Sales"]
    assert "pipeline" in sales["knowledge_areas"]


def test_finance_agent_seed():
    finance = next(a for a in SEED_AGENTS if a["id"] == FINANCE_AGENT_ID)
    assert finance["departments"] == ["Finance"]
    assert "financial reporting" in finance["knowledge_areas"]


@pytest.mark.asyncio
async def test_agents_seeded_in_db():
    """Verify conftest seeds agents into the test database."""
    async with db.async_session() as session:
        result = await session.execute(select(AgentRow))
        rows = result.scalars().all()
        assert len(rows) == 2

        ids = {row.id for row in rows}
        assert SALES_AGENT_ID in ids
        assert FINANCE_AGENT_ID in ids


@pytest.mark.asyncio
async def test_agent_crud():
    """Test creating, reading, updating, and deleting an agent via DB."""
    from uuid import uuid4

    agent_id = uuid4()
    async with db.async_session() as session:
        # Create
        row = AgentRow(
            id=agent_id,
            name="Test Agent",
            role="QA Engineer",
            departments=["Engineering"],
            knowledge_areas=["testing", "automation"],
            scopes=["read:public"],
        )
        session.add(row)
        await session.commit()

        # Read
        fetched = await session.get(AgentRow, agent_id)
        assert fetched is not None
        assert fetched.name == "Test Agent"
        assert fetched.departments == ["Engineering"]

        # Update
        fetched.name = "Updated Agent"
        await session.commit()
        await session.refresh(fetched)
        assert fetched.name == "Updated Agent"

        # Delete
        await session.delete(fetched)
        await session.commit()
        gone = await session.get(AgentRow, agent_id)
        assert gone is None
