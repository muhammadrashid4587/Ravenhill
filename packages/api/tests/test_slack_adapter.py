"""Tests for the Slack → RNE adapter.

Covers URL verification handshake, message normalization, thread detection,
deduplication, and signature verification (both valid and invalid paths).
"""

import hashlib
import hmac
import json
import time
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

import db
from events.models import EventType, SourcePlatform
from integrations.slack.normalizer import (
    NormalizationError,
    normalize_slack_event,
    slack_ts_to_datetime,
)
from integrations.slack.router import verify_slack_signature
from main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


def _message_envelope(
    ts: str = "1700000000.000100",
    thread_ts: str | None = None,
    subtype: str | None = None,
    text: str = "the deployment is broken",
) -> dict:
    inner = {
        "type": "message",
        "user": "U0123ABC",
        "channel": "C456XYZ",
        "channel_name": "engineering",
        "text": text,
        "ts": ts,
    }
    if thread_ts:
        inner["thread_ts"] = thread_ts
    if subtype:
        inner["subtype"] = subtype
    return {
        "token": "t",
        "team_id": "T999",
        "type": "event_callback",
        "event": inner,
    }


# ---------------------------- Normalizer ----------------------------


def test_slack_ts_to_datetime_parses_decimal_seconds():
    dt = slack_ts_to_datetime("1700000000.000500")
    assert dt.year >= 2023


def test_normalize_plain_message_produces_message_sent():
    actor = uuid4()
    rne = normalize_slack_event(_message_envelope(), actor_person_id=actor)
    assert rne.event_type == EventType.MESSAGE_SENT
    assert rne.actor_id == actor
    assert rne.source_platform == SourcePlatform.SLACK
    assert rne.source_event_id == "T999:C456XYZ:1700000000.000100"
    assert rne.channel == "#engineering"
    assert rne.thread_id is None
    assert rne.metadata["text_preview"] == "the deployment is broken"


def test_normalize_thread_reply_sets_thread_reply_type():
    rne = normalize_slack_event(
        _message_envelope(ts="1700000001.000200", thread_ts="1700000000.000100"),
        actor_person_id=uuid4(),
    )
    assert rne.event_type == EventType.THREAD_REPLY
    assert rne.thread_id == "1700000000.000100"


def test_normalize_edit_subtype_maps_to_message_edited():
    rne = normalize_slack_event(
        _message_envelope(subtype="message_changed"),
        actor_person_id=uuid4(),
    )
    assert rne.event_type == EventType.MESSAGE_EDITED


def test_normalize_reaction_added_hashes_on_emoji_and_ts():
    envelope = {
        "team_id": "T999",
        "type": "event_callback",
        "event": {
            "type": "reaction_added",
            "user": "U0123ABC",
            "reaction": "thumbsup",
            "item": {
                "type": "message",
                "channel": "C456XYZ",
                "ts": "1700000000.000100",
            },
            "event_ts": "1700000005.000300",
        },
    }
    rne = normalize_slack_event(envelope, actor_person_id=uuid4())
    assert rne.event_type == EventType.REACTION_ADDED
    # Different reactions on the same message should hash differently.
    envelope2 = json.loads(json.dumps(envelope))
    envelope2["event"]["reaction"] = "eyes"
    rne2 = normalize_slack_event(envelope2, actor_person_id=uuid4())
    assert rne.content_hash != rne2.content_hash


def test_normalize_unsupported_type_raises():
    envelope = {
        "team_id": "T999",
        "type": "event_callback",
        "event": {"type": "team_join", "user": "U0123ABC"},
    }
    with pytest.raises(NormalizationError):
        normalize_slack_event(envelope, actor_person_id=uuid4())


# ---------------------------- Signature verification ----------------------------


def test_verify_slack_signature_valid():
    secret = "testsecret"
    body = b'{"type":"event_callback"}'
    ts = str(int(time.time()))
    basestring = f"v0:{ts}:".encode() + body
    sig = "v0=" + hmac.new(secret.encode(), basestring, hashlib.sha256).hexdigest()
    assert verify_slack_signature(body, ts, sig, secret) is True


def test_verify_slack_signature_invalid():
    assert verify_slack_signature(b"{}", "1", "v0=bogus", "secret") is False


def test_verify_slack_signature_rejects_stale_timestamp():
    secret = "testsecret"
    body = b"{}"
    old_ts = str(int(time.time()) - 10_000)
    basestring = f"v0:{old_ts}:".encode() + body
    sig = "v0=" + hmac.new(secret.encode(), basestring, hashlib.sha256).hexdigest()
    assert verify_slack_signature(body, old_ts, sig, secret) is False


# ---------------------------- End-to-end via HTTP ----------------------------


async def test_url_verification_challenge_echoed(client):
    async with client as c:
        resp = await c.post(
            "/api/integrations/slack/events",
            json={"type": "url_verification", "challenge": "abc123"},
        )
        assert resp.status_code == 200
        assert resp.json()["challenge"] == "abc123"


async def test_slack_message_event_persists_rne(client):
    async with client as c:
        resp = await c.post(
            "/api/integrations/slack/events",
            json=_message_envelope(ts="1700000100.000100"),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["deduplicated"] is False

    # Verify it landed in the events table with SLACK platform.
    async with db.async_session() as session:
        result = await session.execute(
            select(db.EventRow).where(
                db.EventRow.source_platform == "SLACK",
                db.EventRow.source_event_id == "T999:C456XYZ:1700000100.000100",
            )
        )
        row = result.scalar_one_or_none()
        assert row is not None
        assert row.channel == "#engineering"
        assert row.event_type == "message_sent"


async def test_slack_duplicate_event_is_deduplicated(client):
    payload = _message_envelope(ts="1700000200.000100")
    async with client as c:
        first = await c.post("/api/integrations/slack/events", json=payload)
        assert first.json()["deduplicated"] is False
        second = await c.post("/api/integrations/slack/events", json=payload)
        assert second.json()["deduplicated"] is True
        assert first.json()["event_id"] == second.json()["event_id"]


async def test_slack_event_skipped_when_no_user(client):
    payload = {
        "team_id": "T999",
        "type": "event_callback",
        "event": {
            "type": "message",
            "subtype": "channel_join",
            "channel": "C456XYZ",
            "ts": "1700000300.000100",
        },
    }
    async with client as c:
        resp = await c.post("/api/integrations/slack/events", json=payload)
        assert resp.status_code == 200
        assert resp.json()["skipped"] == "no user"
