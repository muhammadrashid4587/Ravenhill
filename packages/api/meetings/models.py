"""Pydantic request/response schemas for the meetings module."""

from datetime import date, datetime

from pydantic import BaseModel


# ---- Requests ----

class MeetingCreate(BaseModel):
    """Create a meeting from a pasted transcript or Google Meet import."""
    title: str
    raw_transcript: str
    agent_id: str
    source: str = "paste"  # "paste" | "google_meet"
    source_meeting_id: str | None = None


class MeetingImportGoogle(BaseModel):
    """Import a meeting directly from Google Meet via calendar event."""
    agent_id: str
    calendar_event_id: str


class TaskUpdate(BaseModel):
    """Update a task's status or details."""
    status: str | None = None  # "pending" | "in_progress" | "done" | "blocked"
    priority: str | None = None
    title: str | None = None
    description: str | None = None
    due_date: date | None = None


class TaskHelpRequest(BaseModel):
    """Ask the agent for help executing a specific task."""
    question: str | None = None  # optional — defaults to "help me with this task"


# ---- Responses ----

class TaskOut(BaseModel):
    id: str
    meeting_id: str
    agent_id: str
    title: str
    description: str
    status: str
    priority: str
    source_excerpt: str | None = None
    due_date: date | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class MeetingFileOut(BaseModel):
    id: str
    meeting_id: str
    filename: str
    description: str | None = None
    file_url: str | None = None


class MeetingOut(BaseModel):
    id: str
    agent_id: str
    title: str
    summary: str | None = None
    source: str
    status: str
    tasks: list[TaskOut] = []
    files: list[MeetingFileOut] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TaskHelpResponse(BaseModel):
    task_id: str
    response: str


class GoogleMeetingListItem(BaseModel):
    """A Google Calendar event that has a Meet transcript available."""
    event_id: str
    title: str
    start_time: str
    end_time: str
    attendees: list[str] = []
    has_transcript: bool = True
