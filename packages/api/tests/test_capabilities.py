"""Capability service + endpoint tests.

Coverage focus: lazy-init creates registry-default rows on first read,
explicit overrides flip `source` to `user`, runtime gate (auto vs ask
vs never) is consulted for unknown tools defensively.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

import db
from capabilities.registry import REGISTRY, get
from capabilities.service import (
    get_permission,
    list_for_agent,
    set_permission,
)
from db import AgentCapabilityRow, AgentRow, OrganizationRow


async def _seed_org_and_agent() -> tuple[uuid.UUID, uuid.UUID]:
    """Insert one org + one agent, return their ids. Each test gets a
    fresh pair so capability rows from one test don't bleed into another."""
    org_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    async with db.async_session() as session:
        session.add(
            OrganizationRow(id=org_id, name="Test Org", slug=f"test-{org_id.hex[:6]}")
        )
        session.add(
            AgentRow(
                id=agent_id,
                org_id=org_id,
                name="Test User",
                role="Member",
                departments=["General"],
                knowledge_areas=[],
                scopes=[],
            )
        )
        await session.commit()
    return org_id, agent_id


@pytest.mark.asyncio
async def test_list_lazy_initializes_with_registry_defaults():
    org_id, agent_id = await _seed_org_and_agent()

    pairs = await list_for_agent(agent_id, org_id)

    # Every registry tool gets a row.
    assert len(pairs) == len(REGISTRY)
    by_id = {cap.tool_id: (cap, row) for cap, row in pairs}
    for cap in REGISTRY:
        assert cap.tool_id in by_id
        _, row = by_id[cap.tool_id]
        assert row.permission == cap.default
        assert row.source == "default"


@pytest.mark.asyncio
async def test_set_permission_marks_source_user_and_persists():
    org_id, agent_id = await _seed_org_and_agent()
    tool_id = "auto_reply_to_inbound_messages"

    # Take the registry through default first so the row exists.
    await list_for_agent(agent_id, org_id)
    assert get(tool_id) is not None

    row = await set_permission(agent_id, tool_id, "never", org_id)
    assert row.permission == "never"
    assert row.source == "user"

    # Round-trip via get_permission (the runtime path).
    perm = await get_permission(agent_id, tool_id, org_id)
    assert perm == "never"


@pytest.mark.asyncio
async def test_set_permission_rejects_unknown_tool():
    org_id, agent_id = await _seed_org_and_agent()
    with pytest.raises(ValueError):
        await set_permission(agent_id, "fake_tool_xyz", "auto", org_id)


@pytest.mark.asyncio
async def test_get_permission_unknown_tool_defaults_never():
    """Defensive default: unknown tool should fail closed, not open."""
    org_id, agent_id = await _seed_org_and_agent()
    perm = await get_permission(agent_id, "no_such_tool", org_id)
    assert perm == "never"


@pytest.mark.asyncio
async def test_capabilities_isolated_across_agents():
    """Setting a capability on agent A must not bleed into agent B."""
    org_a, agent_a = await _seed_org_and_agent()
    org_b, agent_b = await _seed_org_and_agent()

    await set_permission(agent_a, "share_team_knowledge", "never", org_a)

    # Agent B still sees the registry default.
    perm_b = await get_permission(agent_b, "share_team_knowledge", org_b)
    cap = get("share_team_knowledge")
    assert cap is not None
    assert perm_b == cap.default

    # And no rows leaked into agent B's table.
    async with db.async_session() as session:
        result = await session.execute(
            select(AgentCapabilityRow).where(
                AgentCapabilityRow.agent_id == agent_b,
                AgentCapabilityRow.tool_id == "share_team_knowledge",
            )
        )
        assert result.scalar_one_or_none() is None
