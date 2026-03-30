"""Activity tracking — Pydantic schema + DB helper."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

import db
from db import ActivityRow


class ActivityEntry(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    type: str  # "route", "answer", "approval", "doc_request"
    from_agent: str
    to_agent: str | None = None
    description: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


async def log_activity(entry: ActivityEntry):
    """Persist an activity entry to the database."""
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
