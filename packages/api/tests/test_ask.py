"""Tests for the 'who knows about X?' chat surface."""

import pytest
from httpx import ASGITransport, AsyncClient

from graph import queries
from graph.ask import ask_who_knows, extract_topic_query
from graph.models import EdgeType, NodeType
from main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


# ---------------------------- topic extraction ----------------------------


@pytest.mark.parametrize(
    "question,expected",
    [
        ("Who knows about deployment?", "deployment"),
        ("who on my team knows about payments", "payments"),
        ("Who is the expert on billing?", "billing"),
        ("who are the experts on api design", "api design"),
        ("Who can help me with onboarding?", "onboarding"),
        ("Experts on payments", "payments"),
        ("Tell me about deployment.", "deployment"),
        ("deployment", "deployment"),
    ],
)
def test_extract_topic_strips_question_framing(question, expected):
    assert extract_topic_query(question) == expected


def test_extract_topic_normalizes_case_and_punctuation():
    assert extract_topic_query("  Who knows about Deployment???  ") == "deployment"


# ---------------------------- ask_who_knows ----------------------------


async def test_ask_returns_no_signal_when_no_matching_topic():
    result = await ask_who_knows("who knows about quantum dynamics")
    assert result["topic"] is None
    assert result["experts"] == []
    assert "don't have signal" in result["answer"]


async def test_ask_returns_experts_for_known_topic():
    topic = await queries.get_or_create_node(NodeType.TOPIC, "ask-deployment")
    p1 = await queries.get_or_create_node(
        NodeType.PERSON, "deploy-expert-one", attributes={"display_name": "Alice"}
    )
    p2 = await queries.get_or_create_node(
        NodeType.PERSON, "deploy-expert-two", attributes={"display_name": "Bob"}
    )
    await queries.upsert_edge(p1.id, topic.id, EdgeType.EXPERT_IN, weight_delta=0.8)
    await queries.upsert_edge(p2.id, topic.id, EdgeType.EXPERT_IN, weight_delta=0.4)

    result = await ask_who_knows("who knows about ask-deployment?")
    assert result["topic"] is not None
    assert result["topic"]["name"] == "ask-deployment"
    assert len(result["experts"]) == 2
    # Higher-weight expert appears first.
    assert result["experts"][0]["name"] == "Alice"
    # Display name from attributes is used in the formatted answer.
    assert "Alice" in result["answer"]


async def test_ask_substring_match_resolves_topic():
    """If the question's topic phrase is a superset of a known topic name,
    the resolver should still find it."""
    await queries.get_or_create_node(NodeType.TOPIC, "billing")
    actor = await queries.get_or_create_node(NodeType.PERSON, "billing-actor")
    topic = await queries.get_or_create_node(NodeType.TOPIC, "billing")
    await queries.upsert_edge(actor.id, topic.id, EdgeType.EXPERT_IN, weight_delta=0.6)

    result = await ask_who_knows("who knows about billing systems")
    assert result["topic"] is not None
    assert result["topic"]["name"] == "billing"
    assert len(result["experts"]) == 1


async def test_ask_topic_exists_but_no_qualifying_experts():
    await queries.get_or_create_node(NodeType.TOPIC, "fresh-topic")
    result = await ask_who_knows("who knows about fresh-topic")
    assert result["topic"] is not None
    assert result["experts"] == []
    assert "no one's posted enough" in result["answer"]


# ---------------------------- HTTP ----------------------------


async def test_http_ask_endpoint_returns_experts(client):
    topic = await queries.get_or_create_node(NodeType.TOPIC, "http-ask-topic")
    person = await queries.get_or_create_node(
        NodeType.PERSON, "http-ask-person", attributes={"display_name": "Carol"}
    )
    await queries.upsert_edge(person.id, topic.id, EdgeType.EXPERT_IN, weight_delta=0.9)

    async with client as c:
        resp = await c.post(
            "/api/graph/ask",
            json={"question": "who knows about http-ask-topic"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["topic"]["name"] == "http-ask-topic"
        assert len(body["experts"]) == 1
        assert body["experts"][0]["name"] == "Carol"
        assert "Carol" in body["answer"]
