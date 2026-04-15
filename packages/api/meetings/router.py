"""Meetings endpoints — transcript ingestion, task extraction, and task management."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

import db
from db import MeetingRow, TaskRow, MeetingFileRow
from meetings.models import (
    MeetingCreate,
    MeetingImportGoogle,
    MeetingOut,
    TaskHelpRequest,
    TaskHelpResponse,
    TaskOut,
    MeetingFileOut,
    GoogleMeetingListItem,
)
from meetings.models import TaskUpdate as TaskUpdateSchema
from meetings.extractor import extract_tasks, get_task_help
from security.encryption import encrypt, decrypt

router = APIRouter()


def _meeting_to_out(meeting: MeetingRow, tasks: list[TaskRow], files: list[MeetingFileRow]) -> MeetingOut:
    """Convert DB rows to response model. Decrypts sensitive fields."""
    return MeetingOut(
        id=str(meeting.id),
        agent_id=str(meeting.agent_id),
        title=meeting.title,
        summary=decrypt(meeting.summary) if meeting.summary else None,
        source=meeting.source,
        status=meeting.status,
        tasks=[
            TaskOut(
                id=str(t.id),
                meeting_id=str(t.meeting_id),
                agent_id=str(t.agent_id),
                title=t.title,
                description=decrypt(t.description),
                status=t.status,
                priority=t.priority,
                source_excerpt=decrypt(t.source_excerpt) if t.source_excerpt else None,
                due_date=t.due_date,
                created_at=t.created_at,
                updated_at=t.updated_at,
            )
            for t in tasks
        ],
        files=[
            MeetingFileOut(
                id=str(f.id),
                meeting_id=str(f.meeting_id),
                filename=f.filename,
                description=f.description,
                file_url=f.file_url,
            )
            for f in files
        ],
        created_at=meeting.created_at,
        updated_at=meeting.updated_at,
    )


@router.post("/", response_model=MeetingOut)
async def create_meeting(req: MeetingCreate):
    """Create a meeting from a pasted transcript, extract tasks via LLM."""
    meeting_id = uuid.uuid4()
    agent_id = uuid.UUID(req.agent_id)
    now = datetime.now(timezone.utc)

    # 1. Create meeting row in "processing" state (transcript encrypted at rest)
    meeting = MeetingRow(
        id=meeting_id,
        agent_id=agent_id,
        title=req.title,
        raw_transcript=encrypt(req.raw_transcript),
        source=req.source,
        source_meeting_id=req.source_meeting_id,
        status="processing",
        created_at=now,
        updated_at=now,
    )

    async with db.async_session() as session:
        session.add(meeting)
        await session.commit()

    # 2. Extract tasks via LLM
    extraction = await extract_tasks(req.raw_transcript)

    # 3. Save results
    tasks = []
    files = []
    async with db.async_session() as session:
        # Update meeting with summary
        result = await session.execute(select(MeetingRow).where(MeetingRow.id == meeting_id))
        meeting = result.scalar_one()
        meeting.summary = encrypt(extraction.get("summary", ""))
        meeting.status = "ready"
        meeting.updated_at = datetime.now(timezone.utc)

        # Create task rows (descriptions + excerpts encrypted)
        for task_data in extraction.get("tasks", []):
            task = TaskRow(
                id=uuid.uuid4(),
                meeting_id=meeting_id,
                agent_id=agent_id,
                title=task_data["title"],
                description=encrypt(task_data["description"]),
                status="pending",
                priority=task_data.get("priority", "medium"),
                source_excerpt=encrypt(task_data.get("source_excerpt", "")),
                created_at=now,
                updated_at=now,
            )
            session.add(task)
            tasks.append(task)

        # Create file reference rows
        for filename in extraction.get("mentioned_files", []):
            file_row = MeetingFileRow(
                id=uuid.uuid4(),
                meeting_id=meeting_id,
                filename=filename,
                created_at=now,
            )
            session.add(file_row)
            files.append(file_row)

        await session.commit()

    # Log activity
    async with db.async_session() as session:
        from db import ActivityRow

        session.add(ActivityRow(
            id=uuid.uuid4(),
            type="meeting_processed",
            from_agent=req.agent_id,
            description=f"Meeting '{req.title}' processed — {len(tasks)} tasks extracted",
            created_at=now,
        ))
        await session.commit()

    return _meeting_to_out(meeting, tasks, files)


@router.get("/", response_model=list[MeetingOut])
async def list_meetings(agent_id: str | None = None):
    """List meetings, optionally filtered by agent."""
    async with db.async_session() as session:
        query = select(MeetingRow).order_by(MeetingRow.created_at.desc())
        if agent_id:
            query = query.where(MeetingRow.agent_id == uuid.UUID(agent_id))
        result = await session.execute(query)
        meetings = result.scalars().all()

        out = []
        for m in meetings:
            # Fetch tasks for each meeting
            task_result = await session.execute(
                select(TaskRow).where(TaskRow.meeting_id == m.id).order_by(TaskRow.priority)
            )
            tasks = task_result.scalars().all()

            file_result = await session.execute(
                select(MeetingFileRow).where(MeetingFileRow.meeting_id == m.id)
            )
            files = file_result.scalars().all()

            out.append(_meeting_to_out(m, tasks, files))

        return out


@router.get("/{meeting_id}", response_model=MeetingOut)
async def get_meeting(meeting_id: str):
    """Get a single meeting with its tasks and files."""
    mid = uuid.UUID(meeting_id)
    async with db.async_session() as session:
        result = await session.execute(select(MeetingRow).where(MeetingRow.id == mid))
        meeting = result.scalar_one_or_none()
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")

        task_result = await session.execute(
            select(TaskRow).where(TaskRow.meeting_id == mid).order_by(TaskRow.priority)
        )
        tasks = task_result.scalars().all()

        file_result = await session.execute(
            select(MeetingFileRow).where(MeetingFileRow.meeting_id == mid)
        )
        files = file_result.scalars().all()

        return _meeting_to_out(meeting, tasks, files)


@router.patch("/{meeting_id}/tasks/{task_id}", response_model=TaskOut)
async def update_task(meeting_id: str, task_id: str, req: TaskUpdateSchema):
    """Update a task's status, priority, or details."""
    tid = uuid.UUID(task_id)
    async with db.async_session() as session:
        result = await session.execute(select(TaskRow).where(TaskRow.id == tid))
        task = result.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if req.status is not None:
            task.status = req.status
        if req.priority is not None:
            task.priority = req.priority
        if req.title is not None:
            task.title = req.title
        if req.description is not None:
            task.description = req.description
        if req.due_date is not None:
            task.due_date = req.due_date
        task.updated_at = datetime.now(timezone.utc)

        await session.commit()

        return TaskOut(
            id=str(task.id),
            meeting_id=str(task.meeting_id),
            agent_id=str(task.agent_id),
            title=task.title,
            description=decrypt(task.description),
            status=task.status,
            priority=task.priority,
            source_excerpt=decrypt(task.source_excerpt) if task.source_excerpt else None,
            due_date=task.due_date,
            created_at=task.created_at,
            updated_at=task.updated_at,
        )


@router.post("/{meeting_id}/tasks/{task_id}/help", response_model=TaskHelpResponse)
async def task_help(meeting_id: str, task_id: str, req: TaskHelpRequest | None = None):
    """Ask the agent for help executing a specific task."""
    mid = uuid.UUID(meeting_id)
    tid = uuid.UUID(task_id)

    async with db.async_session() as session:
        meeting_result = await session.execute(select(MeetingRow).where(MeetingRow.id == mid))
        meeting = meeting_result.scalar_one_or_none()
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")

        task_result = await session.execute(select(TaskRow).where(TaskRow.id == tid))
        task = task_result.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

    question = req.question if req else None
    response = await get_task_help(
        task_title=task.title,
        task_description=decrypt(task.description),
        meeting_summary=decrypt(meeting.summary) if meeting.summary else "",
        meeting_transcript=decrypt(meeting.raw_transcript),
        question=question,
    )

    return TaskHelpResponse(task_id=str(task.id), response=response)


@router.delete("/{meeting_id}")
async def delete_meeting(meeting_id: str):
    """Delete a meeting and all its tasks and files."""
    mid = uuid.UUID(meeting_id)
    async with db.async_session() as session:
        # Delete files, tasks, then meeting
        await session.execute(MeetingFileRow.__table__.delete().where(MeetingFileRow.meeting_id == mid))
        await session.execute(TaskRow.__table__.delete().where(TaskRow.meeting_id == mid))
        await session.execute(MeetingRow.__table__.delete().where(MeetingRow.id == mid))
        await session.commit()
    return {"status": "deleted"}


# ---- Google Meet integration endpoints ----

@router.get("/google/meetings", response_model=list[GoogleMeetingListItem])
async def list_google_meetings(agent_id: str):
    """List recent Google Calendar events that have Meet transcripts."""
    from integrations.google_meet import list_recent_meetings

    try:
        meetings = await list_recent_meetings(agent_id)
        return meetings
    except Exception as e:
        if "not configured" in str(e).lower() or "not authenticated" in str(e).lower():
            raise HTTPException(status_code=400, detail=str(e))
        raise HTTPException(status_code=500, detail=f"Google API error: {e}")


@router.post("/google/import", response_model=MeetingOut)
async def import_google_meeting(req: MeetingImportGoogle):
    """Import a meeting from Google Meet — fetches transcript and extracts tasks."""
    from integrations.google_meet import fetch_meeting_transcript

    try:
        meeting_data = await fetch_meeting_transcript(req.agent_id, req.calendar_event_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not fetch transcript: {e}")

    # Delegate to the standard creation flow
    create_req = MeetingCreate(
        title=meeting_data["title"],
        raw_transcript=meeting_data["transcript"],
        agent_id=req.agent_id,
        source="google_meet",
        source_meeting_id=req.calendar_event_id,
    )
    return await create_meeting(create_req)


@router.get("/google/auth-url")
async def google_auth_url():
    """Get the Google OAuth authorization URL for connecting Google Meet."""
    from integrations.google_meet import get_auth_url

    try:
        url = await get_auth_url()
        return {"auth_url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/google/callback")
async def google_auth_callback(code: str, agent_id: str):
    """Handle Google OAuth callback — exchange code for tokens."""
    from integrations.google_meet import handle_auth_callback

    try:
        result = await handle_auth_callback(code, agent_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
