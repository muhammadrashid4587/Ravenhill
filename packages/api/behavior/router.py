"""Behavior events — privacy-aware capture + weekly aggregation.

Hard privacy rules (locked in CLAUDE.md):
- NO message bodies
- NO email content
- NO file names

The schema (`event_type`, `object_type`, `object_id`, `status`) is
deliberately small. Don't add a `metadata` JSON field — once it
exists, content sneaks in.
"""

from collections import Counter
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from auth.deps import get_current_agent
import db
from db import AgentRow, BehaviorEventRow, with_org

router = APIRouter()


# Enumerated event types. Adding a new one requires touching this set
# AND documenting it in CLAUDE.md so we keep the surface small + auditable.
KNOWN_EVENT_TYPES = frozenset({
    # Meetings
    "meeting_clicked",
    "meeting_attended",
    "meeting_dismissed",
    "calendar_event_viewed",
    # Tasks
    "task_created",
    "task_completed",
    "task_skipped",
    "task_reopened",
    # Chat
    "chat_replied",
    "chat_thread_opened",
    # Documents (file-id only, never names)
    "document_opened",
    "document_shared",
    # Inbox
    "inbox_item_opened",
})

class CaptureRequest(BaseModel):
    event_type: str = Field(min_length=1, max_length=50)
    object_type: str | None = Field(default=None, max_length=40)
    object_id: str | None = Field(default=None, max_length=64)
    status: str | None = Field(default=None, max_length=40)


class CaptureResponse(BaseModel):
    id: UUID
    accepted: bool


@router.post("/events", response_model=CaptureResponse)
async def capture_event(
    req: CaptureRequest,
    caller: AgentRow = Depends(get_current_agent),
) -> CaptureResponse:
    """Record a single behavior event for the caller. Rejects unknown
    event types so we don't accidentally capture arbitrary client-emitted
    strings (which is how PII leaks happen)."""
    if req.event_type not in KNOWN_EVENT_TYPES:
        raise HTTPException(status_code=400, detail="unknown_event_type")

    async with db.async_session() as session:
        row = BehaviorEventRow(
            org_id=caller.org_id,
            agent_id=caller.id,
            event_type=req.event_type,
            object_type=req.object_type,
            object_id=req.object_id,
            status=req.status,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return CaptureResponse(id=row.id, accepted=True)


# ---------- Weekly Report ----------


class WeeklyDayBucket(BaseModel):
    """One cell on the dot graph — one day of activity, one row of
    events. The frontend draws a 7-by-N grid where N = the event types
    we surface."""
    date: str  # ISO date (YYYY-MM-DD)
    counts: dict[str, int]
    total: int


class WeeklyReportResponse(BaseModel):
    week_start: str  # ISO date
    week_end: str    # ISO date
    days: list[WeeklyDayBucket]   # 7 entries, oldest first
    totals: dict[str, int]         # event_type -> count for the week
    summary: str                   # written narrative ("This is your weekly report…")
    has_data: bool
    generated_at: str


def _generate_summary(
    days: list[WeeklyDayBucket],
    totals: dict[str, int],
    has_data: bool,
) -> str:
    """Deterministic written summary. Reads the aggregates and writes
    a 2-3 sentence narrative. No LLM involved — the report should be
    fast, predictable, and never hallucinate counts."""
    if not has_data:
        return (
            "This is your weekly report. We haven't captured enough "
            "activity yet to summarize the week — start interacting "
            "with meetings, tasks, and chat and check back next "
            "Monday."
        )

    # Identify the busiest day(s) by total count.
    busiest = max(days, key=lambda d: d.total)
    busy_label = busiest.date if busiest.total else "no clear busy day"
    total_events = sum(d.total for d in days)

    # Categorize.
    n_meetings = totals.get("meeting_clicked", 0) + totals.get("calendar_event_viewed", 0)
    n_tasks_done = totals.get("task_completed", 0)
    n_tasks_new = totals.get("task_created", 0)
    n_tasks_skipped = totals.get("task_skipped", 0)
    n_chat = totals.get("chat_replied", 0)
    n_docs = totals.get("document_opened", 0)

    parts: list[str] = ["This is your weekly report."]
    parts.append(
        f"Across the last 7 days you generated {total_events} tracked "
        f"actions, with the busiest day on {busy_label}."
    )
    if n_meetings:
        parts.append(f"You engaged with {n_meetings} calendar event(s).")
    if n_tasks_done or n_tasks_new or n_tasks_skipped:
        bits = []
        if n_tasks_done:
            bits.append(f"completed {n_tasks_done}")
        if n_tasks_new:
            bits.append(f"added {n_tasks_new}")
        if n_tasks_skipped:
            bits.append(f"skipped {n_tasks_skipped}")
        parts.append("On tasks you " + ", ".join(bits) + ".")
    if n_chat:
        parts.append(f"You replied to {n_chat} chat message(s).")
    if n_docs:
        parts.append(f"You opened {n_docs} document(s).")

    return " ".join(parts)


@router.get("/weekly-report", response_model=WeeklyReportResponse)
async def weekly_report(
    caller: AgentRow = Depends(get_current_agent),
) -> WeeklyReportResponse:
    """Aggregate the caller's last 7 calendar days of behavior events
    into a written summary + per-day dot-graph rows. Privacy bar holds:
    no event bodies, no message content. Counts only."""
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)

    async with db.async_session() as session:
        stmt = with_org(
            select(BehaviorEventRow).where(
                BehaviorEventRow.agent_id == caller.id,
                BehaviorEventRow.created_at >= since,
            ),
            BehaviorEventRow,
            caller.org_id,
        )
        rows = (await session.execute(stmt)).scalars().all()

    # Build per-day buckets (oldest first, 7 rows always — empty days
    # show as zero so the dot graph is rectangular).
    days: list[WeeklyDayBucket] = []
    by_day: dict[str, list[BehaviorEventRow]] = {}
    for r in rows:
        if not r.created_at:
            continue
        d = r.created_at.astimezone(timezone.utc).date().isoformat()
        by_day.setdefault(d, []).append(r)

    bucket_dates: list[str] = []
    for i in range(7):
        d = (since + timedelta(days=i)).date().isoformat()
        bucket_dates.append(d)
        events_today = by_day.get(d, [])
        counts = Counter(e.event_type for e in events_today)
        days.append(
            WeeklyDayBucket(
                date=d,
                counts=dict(counts),
                total=len(events_today),
            )
        )

    totals: dict[str, int] = dict(Counter(r.event_type for r in rows))
    has_data = len(rows) > 0
    summary = _generate_summary(days, totals, has_data)

    return WeeklyReportResponse(
        week_start=bucket_dates[0],
        week_end=bucket_dates[-1],
        days=days,
        totals=totals,
        summary=summary,
        has_data=has_data,
        generated_at=now.isoformat(),
    )


# ---------- Privacy disclosure for the UI ----------


class PrivacyDisclosure(BaseModel):
    """Surfaced in the Weekly Report UI so users see exactly what's
    captured. Static — derived from KNOWN_EVENT_TYPES + the schema."""
    event_types: list[str]
    fields_captured: list[str]
    fields_NEVER_captured: list[str]


@router.get("/privacy", response_model=PrivacyDisclosure)
async def privacy_disclosure(
    _: AgentRow = Depends(get_current_agent),
) -> PrivacyDisclosure:
    return PrivacyDisclosure(
        event_types=sorted(KNOWN_EVENT_TYPES),
        fields_captured=[
            "event_type (e.g. 'task_completed')",
            "object_type (e.g. 'task', 'meeting')",
            "object_id (UUID — for grouping only)",
            "status (e.g. 'completed', 'dismissed')",
            "timestamp",
        ],
        fields_NEVER_captured=[
            "message bodies",
            "email content",
            "file names",
            "any free-text user input",
        ],
    )
