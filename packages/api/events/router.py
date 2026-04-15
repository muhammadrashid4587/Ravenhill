"""POST /api/events — the single HTTP entry point for RNE ingestion.

Adapters can either call this endpoint over HTTP (useful for external
services) or import `persist_event` directly (lower-latency in-process).
"""

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

import db
from events.models import EventIngestRequest, EventIngestResponse, RNEvent
from events.persistence import persist_event

router = APIRouter()


@router.post("", response_model=EventIngestResponse, status_code=201)
async def ingest_event(req: EventIngestRequest) -> EventIngestResponse:
    """Ingest a single RNE. Idempotent on (source_platform, source_event_id)."""
    result = await persist_event(req)
    return EventIngestResponse(event_id=result.event_id, deduplicated=result.deduplicated)


@router.get("/{event_id}", response_model=RNEvent)
async def get_event(event_id: str) -> RNEvent:
    async with db.async_session() as session:
        result = await session.execute(
            select(db.EventRow).where(db.EventRow.event_id == event_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="event not found")
        return _row_to_event(row)


@router.get("", response_model=list[RNEvent])
async def list_events(limit: int = 50) -> list[RNEvent]:
    limit = max(1, min(limit, 500))
    async with db.async_session() as session:
        result = await session.execute(
            select(db.EventRow).order_by(db.EventRow.occurred_at.desc()).limit(limit)
        )
        return [_row_to_event(r) for r in result.scalars().all()]


def _row_to_event(row: db.EventRow) -> RNEvent:
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
