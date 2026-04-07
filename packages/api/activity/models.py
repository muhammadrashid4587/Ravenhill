"""Activity tracking — Pydantic schema + DB helper + SSE broadcast."""

import asyncio
from asyncio import Queue
from datetime import datetime, timezone
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

import db
from db import ActivityRow

# ── SSE subscriber management ──────────────────────────────────────────

_subscribers: set[Queue] = set()


async def subscribe() -> Queue:
    """Register a new SSE subscriber and return its queue."""
    q: Queue = Queue(maxsize=256)
    _subscribers.add(q)
    return q


def unsubscribe(q: Queue):
    """Remove a subscriber queue."""
    _subscribers.discard(q)


async def broadcast(entry: dict):
    """Push an activity entry dict to all active subscribers."""
    for q in list(_subscribers):
        try:
            q.put_nowait(entry)
        except asyncio.QueueFull:
            pass


# ── Pydantic model ─────────────────────────────────────────────────────


class ActivityEntry(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    type: str  # "route", "answer", "approval", "doc_request"
    from_agent: str
    to_agent: str | None = None
    description: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


async def log_activity(entry: ActivityEntry):
    """Persist an activity entry to the database and broadcast via SSE."""
    async with db.async_session() as session:
        row = ActivityRow(
            id=entry.id,
            type=entry.type,
            from_agent=entry.from_agent,
            to_agent=entry.to_agent,
            description=entry.description,
            created_at=entry.created_at,
        )
        session.add(row)
        await session.commit()

    # Broadcast to SSE subscribers
    entry_dict = {
        "id": str(entry.id),
        "type": entry.type,
        "from_agent": entry.from_agent,
        "to_agent": entry.to_agent,
        "description": entry.description,
        "created_at": entry.created_at.isoformat(),
    }
    asyncio.create_task(broadcast(entry_dict))
