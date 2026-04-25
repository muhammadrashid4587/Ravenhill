"""Activity endpoints — log and stats for the dashboard, backed by Postgres."""

import asyncio
import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from starlette.requests import Request

from auth.deps import get_current_agent_optional
import db
from activity.models import subscribe, unsubscribe
from db import DEFAULT_ORG_ID, ActivityRow, AgentRow, ApprovalRow, with_org

router = APIRouter()


def _scope_org(agent: AgentRow | None) -> UUID:
    """Scope activity reads to the caller's org, or default for public demo."""
    return agent.org_id if agent and agent.org_id else DEFAULT_ORG_ID


@router.get("/")
async def get_activity(
    type: str | None = None,
    limit: int = 50,
    agent: AgentRow | None = Depends(get_current_agent_optional),
):
    """Return activity log in the caller's org, optionally filtered by type."""
    org_id = _scope_org(agent)
    async with db.async_session() as session:
        query = with_org(select(ActivityRow), ActivityRow, org_id)
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
async def get_stats(agent: AgentRow | None = Depends(get_current_agent_optional)):
    """Dashboard stats scoped to the caller's org."""
    now = datetime.now(timezone.utc)
    today = now.date()
    org_id = _scope_org(agent)

    async with db.async_session() as session:
        # Active agents in this org
        active_agents = await session.scalar(
            with_org(
                select(func.count()).select_from(AgentRow).where(AgentRow.is_active.is_(True)),
                AgentRow,
                org_id,
            )
        )

        # Messages today in this org
        messages_today = await session.scalar(
            with_org(
                select(func.count())
                .select_from(ActivityRow)
                .where(func.date(ActivityRow.created_at) == today),
                ActivityRow,
                org_id,
            )
        )

        # Pending approvals in this org
        pending_approvals = await session.scalar(
            with_org(
                select(func.count())
                .select_from(ApprovalRow)
                .where(ApprovalRow.status == "pending"),
                ApprovalRow,
                org_id,
            )
        )

        # Auto-resolved (answers) today in this org
        auto_resolved = await session.scalar(
            with_org(
                select(func.count())
                .select_from(ActivityRow)
                .where(ActivityRow.type == "answer")
                .where(func.date(ActivityRow.created_at) == today),
                ActivityRow,
                org_id,
            )
        )

        return {
            "active_agents": active_agents or 0,
            "messages_today": messages_today or 0,
            "pending_approvals": pending_approvals or 0,
            "auto_resolved": auto_resolved or 0,
        }


@router.get("/stream")
async def stream_activity(request: Request):
    """SSE endpoint — streams new activity events in real-time."""
    queue = await subscribe()

    async def generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    entry = await asyncio.wait_for(queue.get(), timeout=25)
                    yield f"data: {json.dumps(entry)}\n\n"
                except asyncio.TimeoutError:
                    # keepalive ping
                    yield 'data: {"type": "ping"}\n\n'
        finally:
            unsubscribe(queue)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
