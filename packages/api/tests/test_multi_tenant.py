"""Two-org isolation test — the safety net for multi-tenant leaks.

Seeds two organizations, drops org-scoped rows into each, and asserts
that `with_org` correctly returns only one tenant's data. Any regression
that reintroduces a cross-tenant leak will fail here.
"""
import uuid

import pytest
from sqlalchemy import select

import db
from db import (
    ActivityRow,
    AgentRow,
    ApprovalRow,
    GraphNodeRow,
    OrganizationRow,
    with_org,
)


@pytest.mark.asyncio
async def test_with_org_isolates_two_tenants():
    """Two separate orgs, each with their own agents, approvals, and graph
    nodes, never see each other's data when queried through `with_org`."""
    org_a_id = uuid.uuid4()
    org_b_id = uuid.uuid4()
    agent_a_id = uuid.uuid4()
    agent_b_id = uuid.uuid4()

    async with db.async_session() as session:
        session.add_all([
            OrganizationRow(id=org_a_id, name="Org A", slug=f"org-a-{org_a_id.hex[:6]}"),
            OrganizationRow(id=org_b_id, name="Org B", slug=f"org-b-{org_b_id.hex[:6]}"),
            AgentRow(
                id=agent_a_id, org_id=org_a_id, name="A-Admin",
                role="Admin", departments=["Exec"], knowledge_areas=[], scopes=[],
            ),
            AgentRow(
                id=agent_b_id, org_id=org_b_id, name="B-Admin",
                role="Admin", departments=["Exec"], knowledge_areas=[], scopes=[],
            ),
            ApprovalRow(
                org_id=org_a_id, requesting_agent=agent_a_id, owning_agent=agent_a_id,
                action="share", description="A's approval", resource="doc",
            ),
            ApprovalRow(
                org_id=org_b_id, requesting_agent=agent_b_id, owning_agent=agent_b_id,
                action="share", description="B's approval", resource="doc",
            ),
            ActivityRow(org_id=org_a_id, type="msg", from_agent="A", description="A did a thing"),
            ActivityRow(org_id=org_b_id, type="msg", from_agent="B", description="B did a thing"),
            # Same TOPIC name in both orgs — this used to violate the global
            # (node_type, name) uniqueness; the org-scoped constraint fixes it.
            GraphNodeRow(org_id=org_a_id, node_type="TOPIC", name="Q2 Pricing"),
            GraphNodeRow(org_id=org_b_id, node_type="TOPIC", name="Q2 Pricing"),
        ])
        await session.commit()

    async with db.async_session() as session:
        a_approvals = (await session.execute(
            with_org(select(ApprovalRow), ApprovalRow, org_a_id)
        )).scalars().all()
        b_approvals = (await session.execute(
            with_org(select(ApprovalRow), ApprovalRow, org_b_id)
        )).scalars().all()

        assert len(a_approvals) == 1
        assert len(b_approvals) == 1
        assert a_approvals[0].description == "A's approval"
        assert b_approvals[0].description == "B's approval"

        a_nodes = (await session.execute(
            with_org(select(GraphNodeRow), GraphNodeRow, org_a_id)
        )).scalars().all()
        b_nodes = (await session.execute(
            with_org(select(GraphNodeRow), GraphNodeRow, org_b_id)
        )).scalars().all()

        assert len(a_nodes) == 1
        assert len(b_nodes) == 1
        assert a_nodes[0].id != b_nodes[0].id

        a_activity = (await session.execute(
            with_org(select(ActivityRow), ActivityRow, org_a_id)
        )).scalars().all()
        assert len(a_activity) == 1
        assert a_activity[0].from_agent == "A"


@pytest.mark.asyncio
async def test_with_org_none_does_not_filter():
    """org_id=None is an explicit opt-out used by admin / cross-tenant
    endpoints. It must return every row across both orgs."""
    org_a_id = uuid.uuid4()
    org_b_id = uuid.uuid4()

    async with db.async_session() as session:
        session.add_all([
            OrganizationRow(id=org_a_id, name="Org A", slug=f"org-a-{org_a_id.hex[:6]}"),
            OrganizationRow(id=org_b_id, name="Org B", slug=f"org-b-{org_b_id.hex[:6]}"),
            ActivityRow(org_id=org_a_id, type="msg", from_agent="A", description="A"),
            ActivityRow(org_id=org_b_id, type="msg", from_agent="B", description="B"),
        ])
        await session.commit()

        all_activity = (await session.execute(
            with_org(select(ActivityRow), ActivityRow, None)
        )).scalars().all()
        assert len(all_activity) >= 2


@pytest.mark.asyncio
async def test_seed_default_org_is_idempotent():
    """Calling seed_default_org twice produces a single row, not two."""
    await db.seed_default_org()
    await db.seed_default_org()

    async with db.async_session() as session:
        rows = (await session.execute(
            select(OrganizationRow).where(OrganizationRow.id == db.DEFAULT_ORG_ID)
        )).scalars().all()
        assert len(rows) == 1
        assert rows[0].slug == "default"
