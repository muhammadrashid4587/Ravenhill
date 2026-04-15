"""Slack Events API webhook.

Mount at /api/integrations/slack. Slack's Events API POSTs here, the request
is verified via the signing secret, the envelope is normalized into an RNE,
and the RNE is persisted via events.persistence. The Slack user id is
resolved to a PERSON graph node (get-or-create) so downstream edge updates
have a stable actor UUID.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Request

from config import settings
from events.models import EventIngestRequest
from events.persistence import persist_event
from graph import queries as graph_queries
from graph.models import NodeType
from integrations.slack.normalizer import NormalizationError, normalize_slack_event

router = APIRouter()
logger = logging.getLogger(__name__)


SLACK_SIG_VERSION = "v0"
SLACK_MAX_TIMESTAMP_SKEW_SECONDS = 60 * 5  # Slack's own recommendation.


def verify_slack_signature(
    body_bytes: bytes,
    timestamp: str | None,
    signature: str | None,
    signing_secret: str,
) -> bool:
    """HMAC-SHA256 per https://api.slack.com/authentication/verifying-requests-from-slack."""
    if not timestamp or not signature or not signing_secret:
        return False
    try:
        if abs(time.time() - int(timestamp)) > SLACK_MAX_TIMESTAMP_SKEW_SECONDS:
            return False
    except ValueError:
        return False
    basestring = f"{SLACK_SIG_VERSION}:{timestamp}:".encode() + body_bytes
    expected = SLACK_SIG_VERSION + "=" + hmac.new(
        signing_secret.encode(), basestring, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


async def resolve_slack_user_to_person(slack_user_id: str, team_id: str | None) -> UUID:
    """Map a Slack user id to a PERSON graph node, creating one if absent.

    PERSON name is 'slack:{team_id}:{user_id}' for uniqueness until we
    enrich with a display name via Slack's users.info API.
    """
    canonical = f"slack:{team_id or 'unknown'}:{slack_user_id}"
    node = await graph_queries.get_or_create_node(
        NodeType.PERSON,
        canonical,
        attributes={"slack_user_id": slack_user_id, "team_id": team_id},
    )
    return node.id


@router.post("/events")
async def slack_events(
    request: Request,
    x_slack_request_timestamp: str | None = Header(default=None),
    x_slack_signature: str | None = Header(default=None),
) -> dict[str, Any]:
    body = await request.body()

    if settings.slack_signing_secret:
        if not verify_slack_signature(
            body_bytes=body,
            timestamp=x_slack_request_timestamp,
            signature=x_slack_signature,
            signing_secret=settings.slack_signing_secret,
        ):
            raise HTTPException(status_code=401, detail="invalid slack signature")

    payload = await request.json()

    if payload.get("type") == "url_verification":
        return {"challenge": payload.get("challenge", "")}

    if payload.get("type") != "event_callback":
        return {"ok": True, "skipped": "non-event payload"}

    inner = payload.get("event") or {}
    slack_user_id = inner.get("user") or (inner.get("message") or {}).get("user")
    team_id = payload.get("team_id")

    if not slack_user_id:
        logger.info("slack event without user id; skipping (type=%s)", inner.get("type"))
        return {"ok": True, "skipped": "no user"}

    actor_id = await resolve_slack_user_to_person(slack_user_id, team_id)

    try:
        rne = normalize_slack_event(payload, actor_person_id=actor_id)
    except NormalizationError as exc:
        logger.info("slack event skipped: %s", exc)
        return {"ok": True, "skipped": str(exc)}

    ingest_req = EventIngestRequest(**rne.model_dump(exclude={"event_id", "ingested_at"}))
    result = await persist_event(ingest_req)
    return {"ok": True, "event_id": str(result.event_id), "deduplicated": result.deduplicated}
