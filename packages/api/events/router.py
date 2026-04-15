"""POST /api/events — the single entry point for RNE ingestion.

Adapters (Slack, Gmail, etc.) normalize their native events into RNE and post here.
Dedup is on (source_platform, source_event_id).
"""

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

import db
from db import EventRow
from events.models import EventIngestRequest, EventIngestResponse, RNEvent

router = APIRouter()


@router.post("", response_model=EventIngestResponse, status_code=201)
async def ingest_event(req: EventIngestRequest) -> EventIngestResponse:
    """Ingest a single RNE. Idempotent on (source_platform, source_event_id)."""

    event = RNEvent(**req.model_dump())

    async with db.async_session() as session:
        existing = await session.execute(
            select(EventRow.event_id).where(
                EventRow.source_platform == req.source_platform.value,
                EventRow.source_event_id == req.source_event_id,
            )
        )
        found = existing.scalar_one_or_none()
        if found is not None:
            return EventIngestResponse(event_id=found, deduplicated=True)

        row = EventRow(
            event_id=event.event_id,
            event_type=event.event_type.value,
            actor_id=event.actor_id,
            source_platform=event.source_platform.value,
            source_event_id=event.source_event_id,
            channel=event.channel,
            thread_id=event.thread_id,
            content_hash=event.content_hash,
            content_summary=event.content_summary,
            topic_ids=[str(t) for t in event.topic_ids],
            participants=[str(p) for p in event.participants],
            observer_ids=[str(o) for o in event.observer_ids],
            trust_envelope=event.trust_envelope.model_dump(mode="json"),
            requires_response=event.requires_response,
            requires_verification=event.requires_verification,
            parent_event_id=event.parent_event_id,
            forward_depth=event.forward_depth,
            event_metadata=event.metadata,
            occurred_at=event.occurred_at,
            ingested_at=event.ingested_at,
        )
        session.add(row)
        try:
            await session.commit()
        except IntegrityError:
            # Lost the dedup race — fetch the winner and return its id.
            await session.rollback()
            refetch = await session.execute(
                select(EventRow.event_id).where(
                    EventRow.source_platform == req.source_platform.value,
                    EventRow.source_event_id == req.source_event_id,
                )
            )
            winner = refetch.scalar_one()
            return EventIngestResponse(event_id=winner, deduplicated=True)

    return EventIngestResponse(event_id=event.event_id, deduplicated=False)


@router.get("/{event_id}", response_model=RNEvent)
async def get_event(event_id: str) -> RNEvent:
    async with db.async_session() as session:
        result = await session.execute(select(EventRow).where(EventRow.event_id == event_id))
        row = result.scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="event not found")
        return _row_to_event(row)


@router.get("", response_model=list[RNEvent])
async def list_events(limit: int = 50) -> list[RNEvent]:
    limit = max(1, min(limit, 500))
    async with db.async_session() as session:
        result = await session.execute(
            select(EventRow).order_by(EventRow.occurred_at.desc()).limit(limit)
        )
        return [_row_to_event(r) for r in result.scalars().all()]


def _row_to_event(row: EventRow) -> RNEvent:
    return RNEvent.model_validate(
        {
            "event_id": row.event_id,
            "event_type": row.event_type,
            "actor_id": row.actor_id,
            "source_platform": row.source_platform,
            "source_event_id": row.source_event_id,
            "channel": row.channel,
            "thread_id": row.thread_id,
            "content_hash": row.content_hash,
            "content_summary": row.content_summary,
            "topic_ids": row.topic_ids or [],
            "participants": row.participants or [],
            "observer_ids": row.observer_ids or [],
            "trust_envelope": row.trust_envelope,
            "requires_response": row.requires_response,
            "requires_verification": row.requires_verification,
            "parent_event_id": row.parent_event_id,
            "forward_depth": row.forward_depth,
            "metadata": row.event_metadata or {},
            "occurred_at": row.occurred_at,
            "ingested_at": row.ingested_at,
        }
    )
