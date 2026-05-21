"""Pydantic schemas for the time-blocks module."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


TimeBlockKind = Literal["focus", "buffer", "deep_work", "personal"]


class TimeBlockCreate(BaseModel):
    """Caller-supplied fields when creating a block.

    `start_time` / `end_time` must be timezone-aware (the frontend always
    sends ISO 8601 with offset). The server enforces start < end and
    rejects anything outside a ~6 month window.
    """

    title: str = Field(min_length=1, max_length=300)
    start_time: datetime
    end_time: datetime
    kind: TimeBlockKind = "focus"
    notes: str | None = None
    # If true (default), also push the block to the user's primary Google
    # Calendar — silently skipped when Google isn't connected or the user
    # hasn't re-consented to the calendar.events scope yet.
    sync_to_google: bool = True


class TimeBlockUpdate(BaseModel):
    """Partial update — any field omitted means "leave as is"."""

    title: str | None = Field(default=None, max_length=300)
    start_time: datetime | None = None
    end_time: datetime | None = None
    kind: TimeBlockKind | None = None
    notes: str | None = None


class TimeBlockOut(BaseModel):
    id: str
    agent_id: str
    title: str
    start_time: datetime
    end_time: datetime
    kind: TimeBlockKind
    notes: str | None = None
    google_event_id: str | None = None
    # True when the block was successfully mirrored onto Google Calendar.
    synced_to_google: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None
