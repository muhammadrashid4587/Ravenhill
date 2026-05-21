"""Time blocks — HTTP endpoints for user-created focus / deep-work blocks.

All endpoints require an authenticated session (the block is owned by
the calling agent). When the agent has Google connected with the
calendar.events scope, blocks are mirrored to their primary Google
Calendar as `transparency=opaque` events tagged with a Ravenhill
extended property.
"""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

import db
from auth.deps import get_current_agent
from db import AgentRow, TimeBlockRow, with_org
from time_blocks.google import (
    create_event,
    delete_event,
    update_event,
)
from time_blocks.models import (
    TimeBlockCreate,
    TimeBlockOut,
    TimeBlockUpdate,
)

router = APIRouter()


# Hard cap on how far in the future / past a block can be — keeps the
# index hot and prevents accidental "infinite recurring" experiments
# (recurring blocks aren't supported yet anyway).
MAX_WINDOW = timedelta(days=180)


def _to_out(row: TimeBlockRow) -> TimeBlockOut:
    return TimeBlockOut(
        id=str(row.id),
        agent_id=str(row.agent_id),
        title=row.title,
        start_time=row.start_time,
        end_time=row.end_time,
        kind=row.kind,  # type: ignore[arg-type]
        notes=row.notes,
        google_event_id=row.google_event_id,
        synced_to_google=bool(row.google_event_id),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _validate_window(start: datetime, end: datetime) -> None:
    if start >= end:
        raise HTTPException(status_code=400, detail="end_must_be_after_start")
    if (end - start) > timedelta(hours=12):
        raise HTTPException(status_code=400, detail="block_too_long_max_12h")
    now = datetime.now(timezone.utc)
    if start < now - MAX_WINDOW or end > now + MAX_WINDOW:
        raise HTTPException(status_code=400, detail="block_outside_supported_window")


@router.get("", response_model=list[TimeBlockOut])
async def list_blocks(
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    agent: AgentRow = Depends(get_current_agent),
):
    """Return time blocks owned by the current agent within [start, end].

    When start/end are omitted the default window is the next 30 days
    from now — wide enough for the calendar's agenda and week views.
    """
    if start is None or end is None:
        now = datetime.now(timezone.utc)
        start = start or now - timedelta(days=2)
        end = end or now + timedelta(days=30)

    async with db.async_session() as session:
        stmt = select(TimeBlockRow).where(
            TimeBlockRow.agent_id == agent.id,
            TimeBlockRow.start_time < end,
            TimeBlockRow.end_time > start,
        ).order_by(TimeBlockRow.start_time)
        stmt = with_org(stmt, TimeBlockRow, agent.org_id)
        rows = (await session.execute(stmt)).scalars().all()
        return [_to_out(r) for r in rows]


@router.post("", response_model=TimeBlockOut)
async def create_block(
    req: TimeBlockCreate,
    agent: AgentRow = Depends(get_current_agent),
):
    """Create a block on the agent's calendar.

    If `sync_to_google=True` (default) and Google is connected with the
    calendar.events scope, we also insert the corresponding Calendar event.
    Failure to push to Google is *not* an error — the block persists in
    Ravenhill and the response will report `synced_to_google=False`.
    """
    _validate_window(req.start_time, req.end_time)

    block_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    google_event_id: str | None = None
    if req.sync_to_google:
        google_event_id = await create_event(
            agent.id,
            req.title,
            req.start_time,
            req.end_time,
            req.kind,
            req.notes,
        )

    row = TimeBlockRow(
        id=block_id,
        org_id=agent.org_id,
        agent_id=agent.id,
        title=req.title,
        start_time=req.start_time,
        end_time=req.end_time,
        kind=req.kind,
        notes=req.notes,
        google_event_id=google_event_id,
        created_at=now,
        updated_at=now,
    )
    async with db.async_session() as session:
        session.add(row)
        await session.commit()
        await session.refresh(row)

    return _to_out(row)


@router.patch("/{block_id}", response_model=TimeBlockOut)
async def update_block(
    block_id: str,
    req: TimeBlockUpdate,
    agent: AgentRow = Depends(get_current_agent),
):
    """Partial-update a block. Only its owner can touch it."""
    try:
        bid = uuid.UUID(block_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid_block_id")

    async with db.async_session() as session:
        stmt = select(TimeBlockRow).where(TimeBlockRow.id == bid)
        stmt = with_org(stmt, TimeBlockRow, agent.org_id)
        row = (await session.execute(stmt)).scalar_one_or_none()
        if row is None or row.agent_id != agent.id:
            raise HTTPException(status_code=404, detail="time_block_not_found")

        new_title = req.title if req.title is not None else row.title
        new_start = req.start_time if req.start_time is not None else row.start_time
        new_end = req.end_time if req.end_time is not None else row.end_time
        new_kind = req.kind if req.kind is not None else row.kind
        new_notes = req.notes if req.notes is not None else row.notes
        _validate_window(new_start, new_end)

        row.title = new_title
        row.start_time = new_start
        row.end_time = new_end
        row.kind = new_kind
        row.notes = new_notes
        row.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(row)

    # Best-effort Google sync. If the block has no google_event_id yet
    # (because it was created before the user connected Google, or the
    # original push failed), try to create it now.
    if row.google_event_id:
        await update_event(
            agent.id,
            row.google_event_id,
            row.title,
            row.start_time,
            row.end_time,
            row.kind,
            row.notes,
        )
    else:
        new_id = await create_event(
            agent.id,
            row.title,
            row.start_time,
            row.end_time,
            row.kind,
            row.notes,
        )
        if new_id:
            async with db.async_session() as session:
                stmt = select(TimeBlockRow).where(TimeBlockRow.id == bid)
                stmt = with_org(stmt, TimeBlockRow, agent.org_id)
                row = (await session.execute(stmt)).scalar_one()
                row.google_event_id = new_id
                await session.commit()
                await session.refresh(row)

    return _to_out(row)


@router.delete("/{block_id}", status_code=204)
async def delete_block(
    block_id: str,
    agent: AgentRow = Depends(get_current_agent),
):
    try:
        bid = uuid.UUID(block_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid_block_id")

    google_event_id: str | None = None
    async with db.async_session() as session:
        stmt = select(TimeBlockRow).where(TimeBlockRow.id == bid)
        stmt = with_org(stmt, TimeBlockRow, agent.org_id)
        row = (await session.execute(stmt)).scalar_one_or_none()
        if row is None or row.agent_id != agent.id:
            raise HTTPException(status_code=404, detail="time_block_not_found")
        google_event_id = row.google_event_id
        await session.delete(row)
        await session.commit()

    if google_event_id:
        await delete_event(agent.id, google_event_id)

    return None
