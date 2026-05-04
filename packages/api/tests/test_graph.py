"""Tests for the knowledge graph — nodes, edges, expertise queries."""

import pytest
from httpx import ASGITransport, AsyncClient

from graph import queries
from graph.models import EdgeType, NodeType
from main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def test_node_upsert_is_idempotent():
    """Same (node_type, name) returns the same node id."""
    a = await queries.get_or_create_node(NodeType.PERSON, "Muhammad Rashid")
    b = await queries.get_or_create_node(NodeType.PERSON, "Muhammad Rashid")
    assert a.id == b.id
    # Different node_type with same name is a different node.
    t = await queries.get_or_create_node(NodeType.TOPIC, "Muhammad Rashid")
    assert t.id != a.id


async def test_edge_upsert_increments_weight():
    """weight_delta adds to existing weight on repeated upserts."""
    person = await queries.get_or_create_node(NodeType.PERSON, "Alice")
    topic = await queries.get_or_create_node(NodeType.TOPIC, "payments")

    e1 = await queries.upsert_edge(person.id, topic.id, EdgeType.EXPERT_IN, weight_delta=0.1)
    e2 = await queries.upsert_edge(person.id, topic.id, EdgeType.EXPERT_IN, weight_delta=0.1)
    e3 = await queries.upsert_edge(person.id, topic.id, EdgeType.EXPERT_IN, weight_delta=0.1)

    assert e1.id == e2.id == e3.id
    assert e3.weight == pytest.approx(0.3)


async def test_set_weight_overrides_delta():
    """set_weight replaces rather than adds — used for binary edges."""
    a = await queries.get_or_create_node(NodeType.PERSON, "Bob")
    mgr = await queries.get_or_create_node(NodeType.PERSON, "Carol")

    await queries.upsert_edge(a.id, mgr.id, EdgeType.REPORTS_TO, set_weight=1.0)
    manager = await queries.get_manager(a.id)
    assert manager is not None
    assert manager.id == mgr.id


async def test_who_knows_about_ranks_by_weight():
    """Higher weight = higher rank; min_weight filters low-signal experts."""
    topic = await queries.get_or_create_node(NodeType.TOPIC, "billing")
    alice = await queries.get_or_create_node(NodeType.PERSON, "AliceExpert")
    bob = await queries.get_or_create_node(NodeType.PERSON, "BobExpert")
    carol = await queries.get_or_create_node(NodeType.PERSON, "CarolWeak")

    await queries.upsert_edge(alice.id, topic.id, EdgeType.EXPERT_IN, weight_delta=0.9)
    await queries.upsert_edge(bob.id, topic.id, EdgeType.EXPERT_IN, weight_delta=0.5)
    await queries.upsert_edge(carol.id, topic.id, EdgeType.EXPERT_IN, weight_delta=0.1)

    hits = await queries.who_knows_about(topic.id, min_weight=0.3)

    ids = [h.person.id for h in hits]
    assert alice.id in ids
    assert bob.id in ids
    assert carol.id not in ids  # filtered by min_weight
    assert hits[0].person.id == alice.id  # highest weight first


async def test_expert_in_plus_works_on_sum():
    """A person with both EXPERT_IN and WORKS_ON gets their weights summed."""
    topic = await queries.get_or_create_node(NodeType.TOPIC, "deployment")
    eng = await queries.get_or_create_node(NodeType.PERSON, "EngWithBoth")

    await queries.upsert_edge(eng.id, topic.id, EdgeType.EXPERT_IN, weight_delta=0.4)
    await queries.upsert_edge(eng.id, topic.id, EdgeType.WORKS_ON, weight_delta=0.4)

    hits = await queries.who_knows_about(topic.id, min_weight=0.3)
    assert len(hits) == 1
    assert hits[0].weight == pytest.approx(0.8)


async def test_team_members_returns_persons_via_member_of():
    team = await queries.get_or_create_node(NodeType.TEAM, "engineering")
    p1 = await queries.get_or_create_node(NodeType.PERSON, "Eng1")
    p2 = await queries.get_or_create_node(NodeType.PERSON, "Eng2")
    external = await queries.get_or_create_node(NodeType.PERSON, "External")

    await queries.upsert_edge(p1.id, team.id, EdgeType.MEMBER_OF, set_weight=1.0)
    await queries.upsert_edge(p2.id, team.id, EdgeType.MEMBER_OF, set_weight=1.0)

    members = await queries.team_members(team.id)
    ids = {m.id for m in members}
    assert p1.id in ids
    assert p2.id in ids
    assert external.id not in ids


async def test_http_experts_endpoint(client):
    """End-to-end: create graph via API, query experts via API."""
    async with client as c:
        topic_resp = await c.post(
            "/api/graph/nodes",
            json={"node_type": "TOPIC", "name": "http_test_topic"},
        )
        topic_id = topic_resp.json()["id"]

        person_resp = await c.post(
            "/api/graph/nodes",
            json={"node_type": "PERSON", "name": "HttpExpert"},
        )
        person_id = person_resp.json()["id"]

        await c.post(
            "/api/graph/edges",
            json={
                "from_id": person_id,
                "to_id": topic_id,
                "edge_type": "EXPERT_IN",
                "weight_delta": 0.8,
            },
        )

        experts_resp = await c.get(f"/api/graph/experts?topic_id={topic_id}")
        assert experts_resp.status_code == 200
        hits = experts_resp.json()
        assert len(hits) == 1
        assert hits[0]["person"]["id"] == person_id
