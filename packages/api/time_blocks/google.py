"""Google Calendar mirror for time blocks.

Each helper here is a no-op when the agent has no Google credentials or
the credentials are still on the old read-only scope — the time block is
persisted in Ravenhill regardless, and the next push will pick up the
mirror once the user re-consents.
"""

from __future__ import annotations

import logging
from datetime import datetime
from uuid import UUID

from integrations.google_meet import _build_credentials, _has_tokens, _is_configured

log = logging.getLogger("time_blocks.google")


CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events"


async def _can_write(agent_id: UUID) -> bool:
    """True iff we have a token that includes calendar.events scope."""
    if not _is_configured():
        return False
    if not await _has_tokens(agent_id):
        return False
    try:
        creds = await _build_credentials(agent_id)
    except Exception:  # pragma: no cover — credential build can fail mid-rotate
        return False
    scopes = set(creds.scopes or [])
    return CALENDAR_EVENTS_SCOPE in scopes


def _event_body(
    title: str,
    start: datetime,
    end: datetime,
    kind: str,
    notes: str | None,
) -> dict:
    """Build the JSON body Google Calendar expects."""
    description_parts = [f"Ravenhill {kind} block."]
    if notes:
        description_parts.append("")
        description_parts.append(notes)
    return {
        "summary": title,
        "description": "\n".join(description_parts),
        "start": {"dateTime": start.isoformat()},
        "end": {"dateTime": end.isoformat()},
        # Treat as a busy block on the user's calendar — that's the
        # whole point of focus time.
        "transparency": "opaque",
        # An extended property lets us identify Ravenhill-created events
        # if we ever need to reconcile from the Google side.
        "extendedProperties": {
            "private": {"ravenhill": "true", "ravenhill_kind": kind},
        },
    }


async def create_event(
    agent_id: UUID,
    title: str,
    start: datetime,
    end: datetime,
    kind: str,
    notes: str | None,
) -> str | None:
    """Insert a Calendar event mirroring a new time block.

    Returns the Google `eventId` on success, or None if Google isn't
    connected / writable for this agent. Failures are logged but never
    raised — the block persists in Ravenhill either way.
    """
    if not await _can_write(agent_id):
        return None

    import asyncio
    from googleapiclient.discovery import build

    creds = await _build_credentials(agent_id)
    body = _event_body(title, start, end, kind, notes)

    def _insert() -> str | None:
        try:
            service = build("calendar", "v3", credentials=creds)
            res = service.events().insert(calendarId="primary", body=body).execute()
            return res.get("id")
        except Exception:  # pragma: no cover — network / scope drift
            log.exception("time_block: google insert failed for agent %s", agent_id)
            return None

    return await asyncio.to_thread(_insert)


async def update_event(
    agent_id: UUID,
    google_event_id: str,
    title: str,
    start: datetime,
    end: datetime,
    kind: str,
    notes: str | None,
) -> bool:
    """Patch an existing Calendar event when the user edits a block."""
    if not await _can_write(agent_id):
        return False

    import asyncio
    from googleapiclient.discovery import build

    creds = await _build_credentials(agent_id)
    body = _event_body(title, start, end, kind, notes)

    def _patch() -> bool:
        try:
            service = build("calendar", "v3", credentials=creds)
            service.events().patch(
                calendarId="primary",
                eventId=google_event_id,
                body=body,
            ).execute()
            return True
        except Exception:  # pragma: no cover
            log.exception("time_block: google patch failed for agent %s", agent_id)
            return False

    return await asyncio.to_thread(_patch)


async def delete_event(agent_id: UUID, google_event_id: str) -> bool:
    """Remove the mirror event when the user deletes a block."""
    if not await _can_write(agent_id):
        return False

    import asyncio
    from googleapiclient.discovery import build

    creds = await _build_credentials(agent_id)

    def _delete() -> bool:
        try:
            service = build("calendar", "v3", credentials=creds)
            service.events().delete(
                calendarId="primary",
                eventId=google_event_id,
            ).execute()
            return True
        except Exception:  # pragma: no cover — already-deleted is fine
            log.exception("time_block: google delete failed for agent %s", agent_id)
            return False

    return await asyncio.to_thread(_delete)
