"""Shared persistence for RNE — used by the HTTP ingestion endpoint and by
adapters that receive events out-of-band (Slack webhook, Gmail push, etc.).

Idempotent on (source_platform, source_event_id).
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

import db
from events.models import EventIngestRequest, RNEvent


@dataclass(frozen=True)
class IngestResult:
    event_id: UUID
    deduplicated: bool


async def persist_event(req: EventIngestRequest) -> IngestResult:
    event = RNEvent(**req.model_dump())

    async with db.async_session() as session:
        existing = await session.execute(
            select(db.EventRow.event_id).where(
                db.EventRow.source_platform == req.source_platform.value,
                db.EventRow.source_event_id == req.source_event_id,
            )
        )
        found = existing.scalar_one_or_none()
        if found is not None:
            return IngestResult(event_id=found, deduplicated=True)

        row = db.EventRow(
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
            await session.rollback()
            refetch = await session.execute(
                select(db.EventRow.event_id).where(
                    db.EventRow.source_platform == req.source_platform.value,
                    db.EventRow.source_event_id == req.source_event_id,
                )
            )
            return IngestResult(event_id=refetch.scalar_one(), deduplicated=True)

    return IngestResult(event_id=event.event_id, deduplicated=False)
