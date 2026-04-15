"""Personal context builder — fetches the user's live meeting/task data for chat.

This is what makes the agent "know your stuff." Before routing to other agents,
the orchestrator calls build_personal_context() to get a text block of the user's
meetings, tasks, files, and status — grounded in real database data.
"""

import logging
from uuid import UUID

from sqlalchemy import select

import db
from db import MeetingRow, TaskRow, MeetingFileRow
from security.encryption import decrypt

log = logging.getLogger("meetings.context")


async def build_personal_context(agent_id: UUID) -> str:
    """Build a text context block from the user's meetings and tasks.

    Returns a formatted string that can be injected into an LLM system prompt.
    The LLM should use ONLY this data to answer personal questions —
    no hallucination.
    """
    async with db.async_session() as session:
        # Fetch meetings (most recent first, limit 10)
        meeting_result = await session.execute(
            select(MeetingRow)
            .where(MeetingRow.agent_id == agent_id)
            .where(MeetingRow.status == "ready")
            .order_by(MeetingRow.created_at.desc())
            .limit(10)
        )
        meetings = meeting_result.scalars().all()

        if not meetings:
            return ""

        # Fetch all tasks for these meetings
        meeting_ids = [m.id for m in meetings]
        task_result = await session.execute(
            select(TaskRow)
            .where(TaskRow.meeting_id.in_(meeting_ids))
            .order_by(TaskRow.created_at.desc())
        )
        tasks = task_result.scalars().all()

        # Fetch all files for these meetings
        file_result = await session.execute(
            select(MeetingFileRow)
            .where(MeetingFileRow.meeting_id.in_(meeting_ids))
        )
        files = file_result.scalars().all()

    # Build the context string
    lines = []
    lines.append("=== YOUR MEETINGS & TASKS (LIVE DATA) ===")
    lines.append(f"Total: {len(meetings)} meetings, {len(tasks)} tasks")
    lines.append("")

    # Task summary
    open_tasks = [t for t in tasks if t.status != "done"]
    done_tasks = [t for t in tasks if t.status == "done"]
    high_priority = [t for t in open_tasks if t.priority == "high"]
    in_progress = [t for t in open_tasks if t.status == "in_progress"]

    lines.append(f"Open tasks: {len(open_tasks)} ({len(high_priority)} high priority)")
    lines.append(f"In progress: {len(in_progress)}")
    lines.append(f"Completed: {len(done_tasks)}")
    lines.append("")

    # List open tasks grouped by priority
    if high_priority:
        lines.append("HIGH PRIORITY TASKS:")
        for t in high_priority:
            meeting_title = _find_meeting_title(meetings, t.meeting_id)
            lines.append(f"  - {t.title} [{t.status}] (from: {meeting_title})")
            lines.append(f"    {decrypt(t.description)}")
        lines.append("")

    medium_tasks = [t for t in open_tasks if t.priority == "medium"]
    if medium_tasks:
        lines.append("MEDIUM PRIORITY TASKS:")
        for t in medium_tasks:
            meeting_title = _find_meeting_title(meetings, t.meeting_id)
            lines.append(f"  - {t.title} [{t.status}] (from: {meeting_title})")
            lines.append(f"    {decrypt(t.description)}")
        lines.append("")

    low_tasks = [t for t in open_tasks if t.priority == "low"]
    if low_tasks:
        lines.append("LOW PRIORITY TASKS:")
        for t in low_tasks:
            meeting_title = _find_meeting_title(meetings, t.meeting_id)
            lines.append(f"  - {t.title} [{t.status}] (from: {meeting_title})")
        lines.append("")

    # Meeting summaries
    lines.append("RECENT MEETINGS:")
    for m in meetings[:5]:
        meeting_tasks = [t for t in tasks if t.meeting_id == m.id]
        done_count = sum(1 for t in meeting_tasks if t.status == "done")
        lines.append(f"  [{m.created_at.strftime('%b %d') if m.created_at else 'Unknown'}] {m.title}")
        if m.summary:
            lines.append(f"    Summary: {decrypt(m.summary)}")
        lines.append(f"    Tasks: {len(meeting_tasks)} total, {done_count} done")
        lines.append("")

    # Files
    if files:
        lines.append("FILES MENTIONED IN MEETINGS:")
        for f in files:
            lines.append(f"  - {f.filename}")
        lines.append("")

    # Done tasks (brief)
    if done_tasks:
        lines.append(f"COMPLETED TASKS ({len(done_tasks)}):")
        for t in done_tasks[:5]:
            lines.append(f"  - {t.title} [done]")
        if len(done_tasks) > 5:
            lines.append(f"  ... and {len(done_tasks) - 5} more")
        lines.append("")

    lines.append("=== END OF YOUR DATA ===")

    return "\n".join(lines)


def _find_meeting_title(meetings: list[MeetingRow], meeting_id) -> str:
    for m in meetings:
        if m.id == meeting_id:
            return m.title
    return "Unknown meeting"


async def has_personal_data(agent_id: UUID) -> bool:
    """Quick check: does this agent have any meetings/tasks?"""
    async with db.async_session() as session:
        result = await session.execute(
            select(MeetingRow.id)
            .where(MeetingRow.agent_id == agent_id)
            .limit(1)
        )
        return result.scalar_one_or_none() is not None
