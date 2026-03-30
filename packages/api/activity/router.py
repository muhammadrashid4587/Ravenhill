"""Activity endpoints — log and stats for the dashboard, backed by Postgres."""

from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import func, select

import db
from db import ActivityRow, AgentRow, ApprovalRow

router = APIRouter()


@router.get("/")
async def get_activity(type: str | None = None, limit: int = 50):
    """Return activity log, optionally filtered by type."""
    async with db.async_session() as session:
        query = select(ActivityRow)
        if type:
            query = query.where(ActivityRow.type == type)
        query = query.order_by(ActivityRow.created_at.desc()).limit(limit)

        result = await session.execute(query)
        rows = result.scalars().all()
        items = [
            {
                "id": str(r.id),
                "type": r.type,
                "from_agent": r.from_agent,
                "to_agent": r.to_agent,
                "description": r.description,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
        return {"items": items, "count": len(items)}


@router.get("/stats")
async def get_stats():
    """Dashboard stats derived from activity and agent tables."""
    now = datetime.now(timezone.utc)
    today = now.date()

    async with db.async_session() as session:
        # Active agents
        active_agents = await session.scalar(
            select(func.count()).select_from(AgentRow).where(AgentRow.is_active.is_(True))
        )

        # Messages today
        messages_today = await session.scalar(
            select(func.count())
            .select_from(ActivityRow)
            .where(func.date(ActivityRow.created_at) == today)
        )

        # Pending approvals
        pending_approvals = await session.scalar(
            select(func.count())
            .select_from(ApprovalRow)
            .where(ApprovalRow.status == "pending")
        )

        # Auto-resolved (answers) today
        auto_resolved = await session.scalar(
            select(func.count())
            .select_from(ActivityRow)
            .where(ActivityRow.type == "answer")
            .where(func.date(ActivityRow.created_at) == today)
        )

        return {
            "active_agents": active_agents or 0,
            "messages_today": messages_today or 0,
            "pending_approvals": pending_approvals or 0,
            "auto_resolved": auto_resolved or 0,
        }
