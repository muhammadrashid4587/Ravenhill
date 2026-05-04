"""Capability service — read/write per-agent permissions, gated by org.

Lazy-init: a brand-new agent gets defaults applied on first read so the
table stays sparse until the user changes something. Once a row exists,
its permission is sticky across deploys regardless of registry default
changes — that's intentional. A user's saved choice should never silently
flip because we adjusted a default.

Everything goes through this module — never read or write
`AgentCapabilityRow` directly from a router. That keeps the
default-fallback / source-tracking logic in one place.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select

import db
from db import AgentCapabilityRow

from .registry import REGISTRY, Capability, Permission, get


async def _ensure_initialized(agent_id: UUID, org_id: UUID) -> None:
    """Insert a default row for every registry entry the agent doesn't
    have yet. Idempotent — running it twice is a no-op. Cheap enough to
    call on every read because the second call returns 0 inserts.
    """
    async with db.async_session() as session:
        result = await session.execute(
            select(AgentCapabilityRow.tool_id).where(
                AgentCapabilityRow.agent_id == agent_id
            )
        )
        existing = {row[0] for row in result.all()}
        new_rows = [
            AgentCapabilityRow(
                org_id=org_id,
                agent_id=agent_id,
                tool_id=cap.tool_id,
                permission=cap.default,
                source="default",
            )
            for cap in REGISTRY
            if cap.tool_id not in existing
        ]
        if new_rows:
            session.add_all(new_rows)
            await session.commit()


async def list_for_agent(
    agent_id: UUID, org_id: UUID
) -> list[tuple[Capability, AgentCapabilityRow]]:
    """Return (registry-entry, db-row) pairs for every tool in the
    registry, in the registry's declared order. Lane grouping is the
    UI's job — service layer just gives the flat list.

    Tools that have been removed from the registry but still have rows
    in the DB are filtered out — we don't want the UI to render a
    permission for a tool that no longer means anything.
    """
    await _ensure_initialized(agent_id, org_id)
    async with db.async_session() as session:
        result = await session.execute(
            select(AgentCapabilityRow).where(
                AgentCapabilityRow.agent_id == agent_id
            )
        )
        rows = {r.tool_id: r for r in result.scalars().all()}

    pairs: list[tuple[Capability, AgentCapabilityRow]] = []
    for cap in REGISTRY:
        row = rows.get(cap.tool_id)
        if row is not None:
            pairs.append((cap, row))
    return pairs


async def get_permission(
    agent_id: UUID, tool_id: str, org_id: UUID
) -> Permission:
    """Cheapest possible read — used by runtime gates like
    attempt_auto_reply. Returns the registry default if no row exists
    rather than initializing on every call (init runs from the settings
    page; runtime reads bypass it for speed)."""
    cap = get(tool_id)
    if cap is None:
        # Defensive: an unknown tool defaults to never. Better to fail
        # closed than silently allow.
        return "never"
    async with db.async_session() as session:
        result = await session.execute(
            select(AgentCapabilityRow.permission).where(
                AgentCapabilityRow.agent_id == agent_id,
                AgentCapabilityRow.tool_id == tool_id,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            return cap.default
        return row  # type: ignore[return-value]


async def set_permission(
    agent_id: UUID,
    tool_id: str,
    permission: Permission,
    org_id: UUID,
) -> AgentCapabilityRow:
    """Persist an explicit user override. Marks `source=user` so the
    UI can show 'you set this' vs 'default' vs 'learned'.

    Raises ValueError if the tool isn't in the registry — the caller
    (router) translates that into a 404."""
    cap = get(tool_id)
    if cap is None:
        raise ValueError(f"unknown tool_id: {tool_id}")

    async with db.async_session() as session:
        result = await session.execute(
            select(AgentCapabilityRow).where(
                AgentCapabilityRow.agent_id == agent_id,
                AgentCapabilityRow.tool_id == tool_id,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = AgentCapabilityRow(
                org_id=org_id,
                agent_id=agent_id,
                tool_id=tool_id,
                permission=permission,
                source="user",
            )
            session.add(row)
        else:
            row.permission = permission
            row.source = "user"
            row.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(row)
        return row
