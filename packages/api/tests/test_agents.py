"""Basic agent tests."""

import pytest
from sqlalchemy import select

from agents.seed import COO_ID, PRODUCT_LEAD_ID, ENG_LEAD_ID, OPS_MANAGER_ID, SEED_AGENTS
import db
from db import AgentRow


def test_seed_data_exists():
    assert len(SEED_AGENTS) == 4


def test_coo_agent_seed():
    coo = next(a for a in SEED_AGENTS if a["id"] == COO_ID)
    assert coo["departments"] == ["Executive"]
    assert coo["name"] == "Riley Chen"
    assert "strategy" in coo["knowledge_areas"]


def test_product_lead_seed():
    product = next(a for a in SEED_AGENTS if a["id"] == PRODUCT_LEAD_ID)
    assert product["departments"] == ["Product"]
    assert "marketplace_redesign" in product["topic_keys"]


def test_eng_lead_seed():
    eng = next(a for a in SEED_AGENTS if a["id"] == ENG_LEAD_ID)
    assert eng["departments"] == ["Engineering"]
    # Critical: Engineering's api_dependencies entry must reference OPS_MANAGER_ID
    refs = [
        e.get("references_agent") for e in eng["knowledge_entries"]
        if e.get("references_agent")
    ]
    assert str(OPS_MANAGER_ID) in refs


def test_ops_manager_seed():
    ops = next(a for a in SEED_AGENTS if a["id"] == OPS_MANAGER_ID)
    assert ops["departments"] == ["Operations"]
    assert ops["trust_level"] == "approve"
    # Must have the MSA document that requires approval
    docs = ops["documents"]
    msa_docs = [d for d in docs if d["requires_approval"]]
    assert len(msa_docs) >= 1


@pytest.mark.asyncio
async def test_agents_seeded_in_db():
    """Verify conftest seeds agents into the test database."""
    async with db.async_session() as session:
        result = await session.execute(select(AgentRow))
        rows = result.scalars().all()
        assert len(rows) == 4

        ids = {row.id for row in rows}
        assert COO_ID in ids
        assert PRODUCT_LEAD_ID in ids
        assert ENG_LEAD_ID in ids
        assert OPS_MANAGER_ID in ids


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
            topic_keys=["testing", "qa"],
            knowledge_entries=[],
            documents=[],
            trust_level="auto",
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
