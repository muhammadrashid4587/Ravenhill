"""Tests for the event → graph projection.

Covers topic canonicalization, EXPERT_IN edge accumulation across multiple
events, noise channel filtering, and the end-to-end Slack-to-experts flow.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from events.models import (
    Classification,
    EventIngestRequest,
    EventType,
    SourcePlatform,
    TrustEnvelope,
)
from events.persistence import persist_event
from graph import queries
from graph.models import NodeType
from graph.updater import apply_event_to_graph, canonicalize_topic_name
from main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


# ---------------------------- canonicalize_topic_name ----------------------------


def test_canonicalize_strips_hash_and_lowercases():
    assert canonicalize_topic_name("#Engineering") == "engineering"


def test_canonicalize_strips_archive_suffix():
    assert canonicalize_topic_name("#payments_archived") == "payments"
    assert canonicalize_topic_name("#payments-archive") == "payments"


def test_canonicalize_returns_none_for_noise_channels():
    assert canonicalize_topic_name("#general") is None
    assert canonicalize_topic_name("random") is None
    assert canonicalize_topic_name("#announcements") is None


def test_canonicalize_returns_none_for_empty():
    assert canonicalize_topic_name("") is None
    assert canonicalize_topic_name("#") is None


# ---------------------------- apply_event_to_graph ----------------------------


def _make_event(
    actor_id, channel: str = "#payments", event_type: EventType = EventType.MESSAGE_SENT
):
    from events.models import RNEvent

    return RNEvent(
        event_type=event_type,
        actor_id=actor_id,
        source_platform=SourcePlatform.SLACK,
        source_event_id=f"T:{channel}:{uuid4()}",
        channel=channel,
        content_hash="0" * 64,
        trust_envelope=TrustEnvelope(classification=Classification.INTERNAL),
        occurred_at=datetime.now(timezone.utc),
        metadata={"slack_channel_id": "C123"},
    )


async def test_event_creates_topic_and_expert_edge():
    person = await queries.get_or_create_node(NodeType.PERSON, "p_topic_create")
    event = _make_event(actor_id=person.id, channel="#payments-test")

    touched = await apply_event_to_graph(event)
    assert len(touched) == 1

    hits = await queries.who_knows_about(touched[0], min_weight=0.05)
    assert len(hits) == 1
    assert hits[0].person.id == person.id
    assert hits[0].weight == pytest.approx(0.1)


async def test_repeated_events_accumulate_expert_weight():
    person = await queries.get_or_create_node(NodeType.PERSON, "p_accum")
    for _ in range(5):
        await apply_event_to_graph(_make_event(actor_id=person.id, channel="#deploys-accum"))

    topic = await queries.get_or_create_node(NodeType.TOPIC, "deploys-accum")
    hits = await queries.who_knows_about(topic.id, min_weight=0.4)
    assert len(hits) == 1
    assert hits[0].weight == pytest.approx(0.5)


async def test_noise_channel_does_not_create_topic():
    person = await queries.get_or_create_node(NodeType.PERSON, "p_noise")
    touched = await apply_event_to_graph(_make_event(actor_id=person.id, channel="#general"))
    assert touched == []


async def test_dm_channel_does_not_create_topic():
    person = await queries.get_or_create_node(NodeType.PERSON, "p_dm")
    from events.models import RNEvent

    dm_event = RNEvent(
        event_type=EventType.MESSAGE_SENT,
        actor_id=person.id,
        source_platform=SourcePlatform.SLACK,
        source_event_id=f"T:DM:{uuid4()}",
        channel="#whatever",  # channel name is irrelevant when slack id is a DM
        content_hash="0" * 64,
        trust_envelope=TrustEnvelope(classification=Classification.INTERNAL),
        occurred_at=datetime.now(timezone.utc),
        metadata={"slack_channel_id": "D123ABC"},
    )
    touched = await apply_event_to_graph(dm_event)
    assert touched == []


async def test_reaction_event_does_not_award_expert_credit():
    person = await queries.get_or_create_node(NodeType.PERSON, "p_react")
    event = _make_event(
        actor_id=person.id, channel="#payments-react", event_type=EventType.REACTION_ADDED
    )
    touched = await apply_event_to_graph(event)
    assert touched == []


async def test_communicates_with_edge_when_participants_present():
    actor = await queries.get_or_create_node(NodeType.PERSON, "p_actor_cw")
    other = await queries.get_or_create_node(NodeType.PERSON, "p_other_cw")

    from events.models import RNEvent

    event = RNEvent(
        event_type=EventType.MESSAGE_SENT,
        actor_id=actor.id,
        source_platform=SourcePlatform.SLACK,
        source_event_id=f"T:cw:{uuid4()}",
        channel="#tech-team",
        content_hash="0" * 64,
        participants=[other.id],
        trust_envelope=TrustEnvelope(classification=Classification.INTERNAL),
        occurred_at=datetime.now(timezone.utc),
        metadata={"slack_channel_id": "C123"},
    )

    await apply_event_to_graph(event)
    await apply_event_to_graph(event)
    await apply_event_to_graph(event)

    # 3 events × 0.05 = 0.15 weight on COMMUNICATES_WITH actor → other.
    expertise = await queries.expertise_of(actor.id, min_weight=0.0)
    # And EXPERT_IN should also have grown.
    assert any(h.weight == pytest.approx(0.3) for h in expertise)


# ---------------------------- end-to-end ----------------------------


async def test_persist_event_projects_to_graph():
    person = await queries.get_or_create_node(NodeType.PERSON, "p_e2e_persist")

    req = EventIngestRequest(
        event_type=EventType.MESSAGE_SENT,
        actor_id=person.id,
        source_platform=SourcePlatform.SLACK,
        source_event_id=f"T:e2e:{uuid4()}",
        channel="#billing-e2e",
        content_hash="0" * 64,
        trust_envelope=TrustEnvelope(classification=Classification.INTERNAL),
        occurred_at=datetime.now(timezone.utc),
        metadata={"slack_channel_id": "C123"},
    )

    result = await persist_event(req)
    assert result.deduplicated is False

    topic = await queries.get_or_create_node(NodeType.TOPIC, "billing-e2e")
    hits = await queries.who_knows_about(topic.id, min_weight=0.05)
    assert any(h.person.id == person.id for h in hits)


async def test_dedup_does_not_double_count_edges():
    """If an adapter retries the same event, the graph weight must not grow twice."""
    person = await queries.get_or_create_node(NodeType.PERSON, "p_dedup_no_double")
    same_id = f"T:dedup:{uuid4()}"

    req = EventIngestRequest(
        event_type=EventType.MESSAGE_SENT,
        actor_id=person.id,
        source_platform=SourcePlatform.SLACK,
        source_event_id=same_id,
        channel="#dedupe-edges",
        content_hash="0" * 64,
        trust_envelope=TrustEnvelope(classification=Classification.INTERNAL),
        occurred_at=datetime.now(timezone.utc),
        metadata={"slack_channel_id": "C123"},
    )

    await persist_event(req)
    await persist_event(req)
    await persist_event(req)

    topic = await queries.get_or_create_node(NodeType.TOPIC, "dedupe-edges")
    hits = await queries.who_knows_about(topic.id, min_weight=0.0)
    matching = [h for h in hits if h.person.id == person.id]
    assert len(matching) == 1
    # Weight should be 0.1 (single event), not 0.3.
    assert matching[0].weight == pytest.approx(0.1)
