"""Slack event → RNE normalizer.

Handles the Slack Events API payload shape. Extracts actor, channel, thread,
content hash, timestamp. Produces a RNEvent (unpersisted) that callers
hand to the event ingestion pipeline.

External Slack IDs are namespaced into source_event_id as
'{team_id}:{channel_id}:{ts}' so multi-workspace deployments don't collide.

PERSON node resolution (Slack user_id → graph PERSON UUID) happens in the
ingestion handler, not here — this module stays a pure translator.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from events.models import (
    Classification,
    EventType,
    RNEvent,
    SourcePlatform,
    TrustEnvelope,
)


class NormalizationError(Exception):
    """Raised when a Slack event can't be translated into an RNE."""


# Slack event types we care about for the v1 wedge.
_MESSAGE_SUBTYPE_TO_EVENT_TYPE = {
    None: EventType.MESSAGE_SENT,
    "message_replied": EventType.THREAD_REPLY,
    "message_changed": EventType.MESSAGE_EDITED,
    "message_deleted": EventType.MESSAGE_DELETED,
}


def slack_ts_to_datetime(ts: str) -> datetime:
    """Slack timestamps are 'seconds.microseconds' strings."""
    seconds = float(ts)
    return datetime.fromtimestamp(seconds, tz=timezone.utc)


def build_source_event_id(team_id: str | None, channel_id: str, ts: str) -> str:
    prefix = team_id or "unknown_team"
    return f"{prefix}:{channel_id}:{ts}"


def normalize_slack_event(
    envelope: dict[str, Any],
    actor_person_id: UUID,
    participant_ids: list[UUID] | None = None,
) -> RNEvent:
    """Translate a Slack Events API envelope into an RNEvent.

    `envelope` is the raw `event_callback` payload from Slack (the full body
    Slack POSTs to the webhook). `actor_person_id` is the graph PERSON UUID
    already resolved from the Slack user id by the caller.
    """

    team_id = envelope.get("team_id")
    inner = envelope.get("event") or {}

    slack_type = inner.get("type")
    if slack_type not in {"message", "reaction_added"}:
        raise NormalizationError(f"unsupported slack event type: {slack_type!r}")

    channel_id = inner.get("channel") or ""
    ts = inner.get("ts") or inner.get("event_ts") or ""
    if not ts:
        raise NormalizationError("missing ts")

    channel_name = inner.get("channel_name") or channel_id  # resolved by caller if available

    if slack_type == "message":
        subtype = inner.get("subtype")
        event_type = _MESSAGE_SUBTYPE_TO_EVENT_TYPE.get(subtype, EventType.MESSAGE_SENT)

        text = inner.get("text") or ""
        content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()

        thread_id = inner.get("thread_ts")

        # A reply message has both ts and thread_ts, and ts != thread_ts.
        if thread_id and thread_id != ts:
            event_type = EventType.THREAD_REPLY

        metadata = {
            "text_preview": text[:500],
            "slack_user_id": inner.get("user"),
            "slack_channel_id": channel_id,
            "slack_channel_name": channel_name,
        }

    else:  # reaction_added
        event_type = EventType.REACTION_ADDED
        reaction = inner.get("reaction") or ""
        item = inner.get("item") or {}
        # Reactions hash on (reaction name + the ts they reacted to) so
        # different emoji on the same message dedupe independently.
        content_hash = hashlib.sha256(
            f"{reaction}:{item.get('ts', '')}".encode("utf-8")
        ).hexdigest()
        thread_id = item.get("thread_ts")
        metadata = {
            "reaction": reaction,
            "reacted_to_ts": item.get("ts"),
            "slack_user_id": inner.get("user"),
            "slack_channel_id": item.get("channel"),
        }
        channel_id = item.get("channel") or channel_id

    return RNEvent(
        event_type=event_type,
        actor_id=actor_person_id,
        source_platform=SourcePlatform.SLACK,
        source_event_id=build_source_event_id(team_id, channel_id, ts),
        channel=f"#{channel_name}" if channel_name and not channel_name.startswith("#") else channel_name,
        thread_id=thread_id,
        content_hash=content_hash,
        participants=participant_ids or [],
        trust_envelope=TrustEnvelope(classification=Classification.INTERNAL),
        requires_response=False,
        metadata=metadata,
        occurred_at=slack_ts_to_datetime(ts),
    )
