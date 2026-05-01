"""Thin adapters over Google Calendar / Drive / Gmail APIs.

Each adapter checks `_has_real_connection()` first: if Google is not
configured or the agent has no stored OAuth tokens the adapter returns
an empty list so the frontend shows 'not connected'.  When credentials
are present, the adapter calls the real Google API via a thread pool.
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


async def _has_real_connection(agent_id: str) -> bool:
    """True iff Google is configured AND this agent has stored tokens.
    The adapters return real data only when this is true; otherwise they
    return empty arrays so users see 'not connected' rather than fake
    sample data."""
    if not _is_configured():
        return False
    return await _has_tokens(agent_id)


# ---------------------------------------------------------------------------
# Calendar
# ---------------------------------------------------------------------------


async def list_calendar_events(agent_id: str) -> list[dict[str, Any]]:
    """Upcoming + recently-past events from the user's primary calendar.

    Returns an empty list when the agent hasn't connected Google — real
    customers see 'not connected' rather than a fake schedule. They
    connect via /settings → Google."""
    if not await _has_real_connection(agent_id):
        return []

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


# ---------------------------------------------------------------------------
# Drive
# ---------------------------------------------------------------------------


async def list_drive_files(agent_id: str) -> list[dict[str, Any]]:
    """Files in the agent's Google Drive. Empty until they connect."""
    if not await _has_real_connection(agent_id):
        return []

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
    if not await _has_real_connection(agent_id):
        return []

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


async def list_gmail_threads(agent_id: str, limit: int = 25) -> list[dict[str, Any]]:
    """Recent Gmail threads. Empty until the agent connects Google."""
    if not await _has_real_connection(agent_id):
        return []

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
        "connected": await _has_real_connection(agent_id),
    }
