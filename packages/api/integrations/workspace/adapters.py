"""Thin adapters over Google Calendar / Drive / Gmail APIs.

Each adapter follows the same pattern as `integrations/google_meet.py`:

    if not _is_configured() or no tokens for agent:
        return seed_data()
    else:
        call the real Google API

Keeps the frontend working in mock mode and makes the swap to live
credentials a single code path.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from config import settings
from integrations.google_meet import _build_credentials, _has_tokens

log = logging.getLogger("integrations.workspace")


def _is_configured() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


async def _use_seed(agent_id: str) -> bool:
    if not _is_configured():
        return True
    return not await _has_tokens(agent_id)


# ---------------------------------------------------------------------------
# Calendar
# ---------------------------------------------------------------------------


async def list_calendar_events(agent_id: str) -> list[dict[str, Any]]:
    """Upcoming + recently-past events from the user's primary calendar."""
    if await _use_seed(agent_id):
        return _seed_calendar_events()

    import asyncio
    from googleapiclient.discovery import build

    creds = await _build_credentials(agent_id)

    def _fetch() -> list[dict[str, Any]]:
        service = build("calendar", "v3", credentials=creds)
        now = datetime.now(timezone.utc)
        time_min = (now - timedelta(days=2)).isoformat()
        time_max = (now + timedelta(days=14)).isoformat()
        res = service.events().list(
            calendarId="primary",
            timeMin=time_min,
            timeMax=time_max,
            singleEvents=True,
            orderBy="startTime",
            maxResults=50,
        ).execute()
        events: list[dict[str, Any]] = []
        for e in res.get("items", []):
            start = e.get("start", {}).get("dateTime") or e.get("start", {}).get("date")
            end = e.get("end", {}).get("dateTime") or e.get("end", {}).get("date")
            if not start or not end:
                continue
            conf = e.get("conferenceData") or {}
            meet_url = None
            for ep in conf.get("entryPoints", []):
                if ep.get("entryPointType") == "video":
                    meet_url = ep.get("uri")
                    break
            events.append({
                "id": e["id"],
                "title": e.get("summary", "Untitled"),
                "description": e.get("description"),
                "start_time": start,
                "end_time": end,
                "attendees": [a.get("email", "") for a in e.get("attendees", [])],
                "location": e.get("location"),
                "source": "google_calendar",
                "has_transcript": bool(e.get("conferenceData")),
                "meeting_url": meet_url,
            })
        return events

    return await asyncio.to_thread(_fetch)


def _seed_calendar_events() -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)

    def iso(delta_hours: float) -> str:
        return (now + timedelta(hours=delta_hours)).isoformat()

    return [
        {
            "id": "ev_seed_1",
            "title": "Weekly sync w/ Muhammad",
            "description": "Standing weekly. Walk through this week's progress on V1, blockers, and what's queued for next week.",
            "start_time": iso(4),
            "end_time": iso(4.5),
            "attendees": ["muhammad@e-agent.ai", "me@e-agent.ai"],
            "source": "google_calendar",
            "meeting_url": "https://meet.google.com/abc-defg-hij",
        },
        {
            "id": "ev_seed_2",
            "title": "SLS design partner kickoff",
            "description": "First working session with the SLS team. Cover onboarding, integration scope, success criteria, and weekly cadence.",
            "start_time": iso(24),
            "end_time": iso(25),
            "attendees": ["team@sls.com", "max@e-agent.ai"],
            "source": "google_calendar",
            "has_transcript": True,
        },
        {
            "id": "ev_seed_3",
            "title": "V1 scope review",
            "description": "Lock the V1 surface. Walk the demo flow end-to-end and confirm what ships in the public release vs. what defers.",
            "start_time": iso(48),
            "end_time": iso(49),
            "attendees": ["max@e-agent.ai", "muhammad@e-agent.ai", "me@e-agent.ai"],
            "source": "google_calendar",
        },
        {
            "id": "ev_seed_4",
            "title": "Pricing deck finalization",
            "description": "Final review of the pricing tiers, packaging, and the comparison slide before sending to design partners.",
            "start_time": iso(72),
            "end_time": iso(73),
            "attendees": ["karen@e-agent.ai", "jordan@e-agent.ai"],
            "source": "google_calendar",
            "meeting_url": "https://meet.google.com/xyz-abcd-efg",
        },
    ]


# ---------------------------------------------------------------------------
# Drive
# ---------------------------------------------------------------------------


_DRIVE_SEED_FILES: list[dict[str, Any]] = [
    {
        "id": "f1",
        "name": "V1 Implementation Plan.md",
        "mime_type": "text/markdown",
        "owner": "max@e-agent.ai",
        "last_modified": "2026-04-17T22:00:00Z",
        "url": "https://drive.google.com/file/d/f1",
        "source": "google_drive",
    },
    {
        "id": "f2",
        "name": "SLS Onboarding Checklist.gdoc",
        "mime_type": "application/vnd.google-apps.document",
        "owner": "max@e-agent.ai",
        "last_modified": "2026-04-16T14:00:00Z",
        "url": "https://drive.google.com/file/d/f2",
        "source": "google_drive",
    },
    {
        "id": "f3",
        "name": "Permissions schema draft.md",
        "mime_type": "text/markdown",
        "owner": "muhammad@e-agent.ai",
        "last_modified": "2026-04-17T08:00:00Z",
        "url": "https://drive.google.com/file/d/f3",
        "source": "google_drive",
    },
    {
        "id": "f4",
        "name": "Q2 Pricing Deck.gslides",
        "mime_type": "application/vnd.google-apps.presentation",
        "owner": "karen@e-agent.ai",
        "last_modified": "2026-04-17T18:00:00Z",
        "url": "https://drive.google.com/file/d/f4",
        "source": "google_drive",
    },
    {
        "id": "f5",
        "name": "Focus group raw export.csv",
        "mime_type": "text/csv",
        "owner": "marco@e-agent.ai",
        "last_modified": "2026-04-16T10:00:00Z",
        "url": "https://drive.google.com/file/d/f5",
        "source": "google_drive",
    },
    {
        "id": "f6",
        "name": "Board memo - April 2026.gdoc",
        "mime_type": "application/vnd.google-apps.document",
        "owner": "max@e-agent.ai",
        "last_modified": "2026-04-14T12:00:00Z",
        "url": "https://drive.google.com/file/d/f6",
        "source": "google_drive",
    },
    {
        "id": "f7",
        "name": "SLS Demo Recording.mp4",
        "mime_type": "video/mp4",
        "owner": "likitha@e-agent.ai",
        "last_modified": "2026-04-16T20:00:00Z",
        "url": "https://drive.google.com/file/d/f7",
        "source": "google_drive",
    },
]


_DRIVE_SEED_FOLDERS: list[dict[str, Any]] = [
    {"id": "root", "name": "My Drive", "file_ids": [f["id"] for f in _DRIVE_SEED_FILES]},
    {"id": "shared", "name": "Shared with me", "file_ids": ["f4", "f5"],
     "shared_with": ["karen@e-agent.ai", "marco@e-agent.ai"]},
    {"id": "starred", "name": "Starred", "file_ids": ["f1", "f4"]},
    {"id": "recent", "name": "Recent", "file_ids": ["f1", "f7", "f2", "f3"]},
    {"id": "meet", "name": "Meet Recordings", "file_ids": ["f7"]},
]


async def list_drive_files(agent_id: str) -> list[dict[str, Any]]:
    if await _use_seed(agent_id):
        return list(_DRIVE_SEED_FILES)

    import asyncio
    from googleapiclient.discovery import build

    creds = await _build_credentials(agent_id)

    def _fetch() -> list[dict[str, Any]]:
        service = build("drive", "v3", credentials=creds)
        res = service.files().list(
            orderBy="modifiedTime desc",
            pageSize=50,
            fields=(
                "files(id,name,mimeType,owners(emailAddress),"
                "modifiedTime,webViewLink)"
            ),
        ).execute()
        out = []
        for f in res.get("files", []):
            owners = f.get("owners") or []
            out.append({
                "id": f["id"],
                "name": f.get("name", "Untitled"),
                "mime_type": f.get("mimeType", "application/octet-stream"),
                "owner": owners[0].get("emailAddress", "") if owners else "",
                "last_modified": f.get("modifiedTime", ""),
                "url": f.get("webViewLink", ""),
                "source": "google_drive",
            })
        return out

    return await asyncio.to_thread(_fetch)


async def list_drive_folders(agent_id: str) -> list[dict[str, Any]]:
    """Virtual folders (My Drive / Shared / Starred / Recent / Meet).

    Drive's native folder model doesn't map 1:1 to these buckets, so we
    derive them from the file list. This gives the frontend a stable shape.
    """
    if await _use_seed(agent_id):
        return list(_DRIVE_SEED_FOLDERS)

    files = await list_drive_files(agent_id)
    ids = [f["id"] for f in files]
    by_mime = {f["id"]: f["mime_type"] for f in files}
    videos = [i for i, m in by_mime.items() if m.startswith("video/")]
    return [
        {"id": "root", "name": "My Drive", "file_ids": ids},
        {"id": "recent", "name": "Recent", "file_ids": ids[:10]},
        {"id": "meet", "name": "Meet Recordings", "file_ids": videos},
    ]


# ---------------------------------------------------------------------------
# Gmail
# ---------------------------------------------------------------------------


_GMAIL_SEED: list[dict[str, Any]] = [
    {
        "id": "e1",
        "subject": "Re: V1 scope — SLS deployment",
        "from": "max@e-agent.ai",
        "snippet": "Pushed the deadline by a week after the design partner call...",
        "received_at": "2026-04-18T21:00:00Z",
        "unread": True,
        "thread_url": "https://mail.google.com/mail/u/0/#inbox/e1",
    },
    {
        "id": "e2",
        "subject": "Permissions schema — first pass",
        "from": "muhammad@e-agent.ai",
        "snippet": "Here's the ERD; let me know what the UI needs before I migrate.",
        "received_at": "2026-04-18T14:30:00Z",
        "unread": True,
        "thread_url": "https://mail.google.com/mail/u/0/#inbox/e2",
    },
    {
        "id": "e3",
        "subject": "Design partner interview — SLS ops lead",
        "from": "max@e-agent.ai",
        "snippet": "Interview scheduled for Friday 3pm. Prep doc attached.",
        "received_at": "2026-04-17T19:00:00Z",
        "unread": False,
        "thread_url": "https://mail.google.com/mail/u/0/#inbox/e3",
    },
    {
        "id": "e4",
        "subject": "Q2 pricing deck — revisions",
        "from": "karen@e-agent.ai",
        "snippet": "Revised draft in Drive. Jordan, can you QA the burn-rate slide?",
        "received_at": "2026-04-17T15:00:00Z",
        "unread": True,
        "thread_url": "https://mail.google.com/mail/u/0/#inbox/e4",
    },
    {
        "id": "e5",
        "subject": "Contractor invoice — Devon Ray, April",
        "from": "billing@e-agent.ai",
        "snippet": "Invoice #R-0042, $5,200. Auto-pay scheduled for 2026-04-30.",
        "received_at": "2026-04-16T10:00:00Z",
        "unread": False,
        "thread_url": "https://mail.google.com/mail/u/0/#inbox/e5",
    },
    {
        "id": "e6",
        "subject": "Slack adapter — OAuth decision",
        "from": "priya@e-agent.ai",
        "snippet": "Fernet for V1, KMS later — approved. PR ready for review.",
        "received_at": "2026-04-16T08:30:00Z",
        "unread": False,
        "thread_url": "https://mail.google.com/mail/u/0/#inbox/e6",
    },
]


async def list_gmail_threads(agent_id: str, limit: int = 25) -> list[dict[str, Any]]:
    if await _use_seed(agent_id):
        return list(_GMAIL_SEED[:limit])

    import asyncio
    from googleapiclient.discovery import build

    creds = await _build_credentials(agent_id)

    def _fetch() -> list[dict[str, Any]]:
        service = build("gmail", "v1", credentials=creds)
        threads_res = service.users().threads().list(
            userId="me", maxResults=limit, labelIds=["INBOX"],
        ).execute()
        out: list[dict[str, Any]] = []
        for th in threads_res.get("threads", []):
            full = service.users().threads().get(
                userId="me", id=th["id"], format="metadata",
                metadataHeaders=["Subject", "From", "Date"],
            ).execute()
            msgs = full.get("messages", [])
            if not msgs:
                continue
            headers = {
                h["name"]: h["value"]
                for h in msgs[0].get("payload", {}).get("headers", [])
            }
            unread = any("UNREAD" in m.get("labelIds", []) for m in msgs)
            out.append({
                "id": th["id"],
                "subject": headers.get("Subject", "(no subject)"),
                "from": headers.get("From", ""),
                "snippet": msgs[0].get("snippet", ""),
                "received_at": headers.get("Date", ""),
                "unread": unread,
                "thread_url": f"https://mail.google.com/mail/u/0/#inbox/{th['id']}",
            })
        return out

    return await asyncio.to_thread(_fetch)


# ---------------------------------------------------------------------------
# Knowledge-graph hook — Gmail → RNE (Phase 1 KB ingestion)
# ---------------------------------------------------------------------------


_GMAIL_STOPWORDS = {
    "re", "fwd", "the", "and", "for", "with", "from", "this", "that",
    "your", "about", "please", "hello", "hey", "have", "will", "would",
    "could", "just", "need", "want",
}


def _pick_topic_from_subject(subject: str) -> str | None:
    """Pick a single topic token per thread so the graph gets stable signal."""
    if not subject:
        return None
    cleaned = re.sub(r"[^a-zA-Z0-9\s-]", " ", subject)
    tokens = [t.lower() for t in cleaned.split()]
    for tok in tokens:
        if len(tok) >= 4 and tok.isalpha() and tok not in _GMAIL_STOPWORDS:
            return tok
    return None


def _parse_gmail_datetime(s: str) -> datetime:
    """Gmail returns RFC 2822 ('Fri, 18 Apr 2026 21:00:00 +0000') for real
    threads and ISO 8601 for the seed data. Be permissive either way."""
    if not s:
        return datetime.now(timezone.utc)
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        try:
            from email.utils import parsedate_to_datetime
            return parsedate_to_datetime(s)
        except (TypeError, ValueError):
            return datetime.now(timezone.utc)


async def ingest_gmail_topics(agent_id: str, limit: int = 25) -> dict[str, Any]:
    """Stream recent Gmail threads through the RNE pipeline.

    Each thread becomes one EMAIL_SENT event. `graph.updater` then creates
    TOPIC nodes and accumulates EXPERT_IN edges exactly like it does for
    Slack. Idempotent on (GMAIL, thread_id) so re-running this is safe.
    """
    import hashlib
    from uuid import UUID

    from events.models import (
        Classification,
        EventIngestRequest,
        EventType,
        SourcePlatform,
        TrustEnvelope,
    )
    from events.persistence import persist_event

    threads = await list_gmail_threads(agent_id, limit=limit)

    # actor_id needs to be a UUID; when the caller supplied "demo" (no login)
    # we synthesize a stable namespaced UUID so events still persist.
    try:
        actor_uuid = UUID(agent_id)
    except (ValueError, AttributeError):
        actor_uuid = UUID("00000000-0000-0000-0000-000000000099")

    topics_seen: list[str] = []
    persisted = 0
    deduplicated = 0

    for t in threads:
        subject = t.get("subject") or ""
        snippet = t.get("snippet") or ""
        topic = _pick_topic_from_subject(subject)
        if topic:
            topics_seen.append(topic)

        content_hash = hashlib.sha256(
            f"{subject}\n{snippet}".encode("utf-8")
        ).hexdigest()

        req = EventIngestRequest(
            event_type=EventType.EMAIL_SENT,
            actor_id=actor_uuid,
            source_platform=SourcePlatform.GMAIL,
            source_event_id=f"gmail:{t.get('id')}",
            channel=topic,  # None means "no topic projection" — graph.updater handles that
            thread_id=str(t.get("id")),
            content_hash=content_hash,
            content_summary=snippet[:280] if snippet else None,
            trust_envelope=TrustEnvelope(classification=Classification.INTERNAL),
            metadata={
                "gmail_subject": subject[:300],
                "gmail_from": t.get("from"),
            },
            occurred_at=_parse_gmail_datetime(t.get("received_at", "")),
        )

        try:
            result = await persist_event(req)
            if result.deduplicated:
                deduplicated += 1
            else:
                persisted += 1
        except Exception:  # pragma: no cover — ingest must never cascade
            log.exception("gmail ingest failed for thread %s", t.get("id"))

    # Preserve insertion order for preview
    seen_set: set[str] = set()
    unique_topics: list[str] = []
    for tok in topics_seen:
        if tok in seen_set:
            continue
        seen_set.add(tok)
        unique_topics.append(tok)

    return {
        "agent_id": agent_id,
        "threads_scanned": len(threads),
        "topics_detected": unique_topics[:20],
        "persisted": persisted,
        "deduplicated": deduplicated,
        "connected": not await _use_seed(agent_id),
    }
