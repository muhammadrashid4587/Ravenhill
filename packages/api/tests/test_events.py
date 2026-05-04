"""Tests for RNE ingestion."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


def _payload(source_event_id: str = "slack_msg_001") -> dict:
    return {
        "event_type": "message_sent",
        "actor_id": str(uuid4()),
        "source_platform": "SLACK",
        "source_event_id": source_event_id,
        "channel": "#engineering",
        "thread_id": "T123",
        "content_hash": "a" * 64,
        "topic_ids": [],
        "participants": [],
        "observer_ids": [],
        "trust_envelope": {
            "classification": "INTERNAL",
            "directional_scope": [],
            "max_hops": 3,
            "source_confidence": 0.9,
            "self_only": False,
        },
        "requires_response": False,
        "requires_verification": False,
        "forward_depth": 0,
        "metadata": {"text_preview": "deployment pipeline is broken"},
        "occurred_at": datetime.now(timezone.utc).isoformat(),
    }


@pytest.mark.asyncio
async def test_ingest_event_persists() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/events", json=_payload("slack_001"))
        assert resp.status_code == 201
        body = resp.json()
        assert body["deduplicated"] is False
        assert "event_id" in body


@pytest.mark.asyncio
async def test_ingest_event_deduplicates() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = _payload("slack_dup_001")
        first = await client.post("/api/events", json=payload)
        assert first.status_code == 201
        assert first.json()["deduplicated"] is False
        first_id = first.json()["event_id"]

        # Same source_event_id → should dedup and return same event_id.
        second = await client.post("/api/events", json=payload)
        assert second.status_code == 201
        assert second.json()["deduplicated"] is True
        assert second.json()["event_id"] == first_id


@pytest.mark.asyncio
async def test_list_events_returns_ingested() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/api/events", json=_payload("slack_list_001"))
        resp = await client.get("/api/events?limit=10")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
