"""Orchestrator tests — validate the new multi-agent routing, synthesis, and approval logic."""

import json
from uuid import UUID

import pytest

from agents.seed import COO_ID, OPS_MANAGER_ID
from approvals.router import ApprovalStatus
from auth.deps import get_current_agent
import db
from db import AgentRow, ApprovalRow
from orchestrator import (
    orchestrate,
    complete_doc_request,
    reset_demo,
    OrchestrateRequest,
    _conversation_sessions,
)


@pytest.fixture(autouse=True)
def clear_sessions():
    """Clear conversation sessions before each test."""
    _conversation_sessions.clear()
    yield
    _conversation_sessions.clear()


def _override_auth(agent_id: UUID):
    """Return a FastAPI dependency override that pretends the given agent is logged in."""
    fake = AgentRow()
    fake.id = agent_id

    async def _fake_current_agent():
        return fake

    return _fake_current_agent


@pytest.mark.asyncio
async def test_marketplace_redesign_routes_to_product_and_engineering():
    """Moment 1: COO asks about marketplace redesign -> Product + Engineering consulted.

    After FIX 2, references_agent is scoped to relevant topics — a general
    marketplace redesign question no longer triggers a second-hop from the
    api_dependencies entry. Second-hop only fires when asking specifically
    about the API blocker.
    """
    req = OrchestrateRequest(
        message="Are we on track for the marketplace redesign?",
        agent_id=COO_ID,
    )
    resp = await orchestrate(req)

    assert resp.intent in ("information_query", "follow_up")
    assert resp.answer is not None
    assert len(resp.answer) > 0
    # Sources are now "Name (Role)" format
    assert any("Product" in s for s in resp.sources) or any("Engineering" in s for s in resp.sources)
    assert resp.approval_id is None


@pytest.mark.asyncio
async def test_api_dependency_routes_to_engineering():
    """Moment 2 start: COO asks about API dependency -> Engineering consulted."""
    req = OrchestrateRequest(
        message="What's blocking the API dependency?",
        agent_id=COO_ID,
    )
    resp = await orchestrate(req)

    assert resp.intent in ("information_query", "follow_up")
    assert resp.answer is not None
    assert any("Engineering" in s for s in resp.sources)
    # Engineering's api_dependencies entry references OPS_MANAGER_ID
    assert resp.second_hop_available is True
    assert resp.second_hop_agent_id == str(OPS_MANAGER_ID)


@pytest.mark.asyncio
async def test_vendor_contract_request_creates_approval():
    """Moment 3: COO asks for vendor contract -> approval created for Operations."""
    req = OrchestrateRequest(
        message="Ask ops to share the vendor contract",
        agent_id=COO_ID,
    )
    resp = await orchestrate(req)

    assert resp.intent == "action_request"
    assert resp.approval_id is not None
    assert resp.answer is None  # Waiting for approval
    assert resp.target_agent is not None
    assert resp.target_agent["name"] == "Alex Kumar"

    # Verify approval was created in the database
    async with db.async_session() as session:
        row = await session.get(ApprovalRow, resp.approval_id)
        assert row is not None
        assert row.requesting_agent == COO_ID
        assert row.owning_agent == OPS_MANAGER_ID
        assert row.status == "pending"


@pytest.mark.asyncio
async def test_unknown_agent_returns_404():
    """Requesting orchestration with a non-existent agent should fail."""
    fake_id = UUID("99999999-9999-9999-9999-999999999999")
    req = OrchestrateRequest(message="Hello", agent_id=fake_id)

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await orchestrate(req)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_steps_are_populated():
    """Every orchestration should produce steps with status done."""
    req = OrchestrateRequest(
        message="Are we on track for the marketplace redesign?",
        agent_id=COO_ID,
    )
    resp = await orchestrate(req)

    assert len(resp.steps) >= 2
    assert resp.steps[0].label == "Understanding your question..."
    assert all(step.status == "done" for step in resp.steps)


@pytest.mark.asyncio
async def test_sources_populated_for_multi_agent():
    """Multi-agent queries should list all consulted agent roles as sources."""
    req = OrchestrateRequest(
        message="Are we on track for the marketplace redesign?",
        agent_id=COO_ID,
    )
    resp = await orchestrate(req)

    assert len(resp.sources) >= 1
    # Sources are "Name (Role)" format
    assert any("Product" in s for s in resp.sources) or any(
        "Engineering" in s for s in resp.sources
    )


@pytest.mark.asyncio
async def test_complete_doc_request_after_approval():
    """End-to-end: doc request -> approve -> document shared."""
    # Step 1: Create doc request
    req = OrchestrateRequest(
        message="Ask ops to share the vendor contract",
        agent_id=COO_ID,
    )
    resp = await orchestrate(req)
    approval_id = resp.approval_id
    assert approval_id is not None
    assert resp.answer is None

    # Step 2: Check status while still pending
    pending_resp = await complete_doc_request(approval_id)
    assert pending_resp.answer is None

    # Step 3: Approve it in the database
    async with db.async_session() as session:
        row = await session.get(ApprovalRow, approval_id)
        row.status = "approved"
        await session.commit()

    # Step 4: Complete — should return confirmation
    completed = await complete_doc_request(approval_id)
    assert completed.answer is not None
    assert "approved" in completed.answer.lower() or "shared" in completed.answer.lower()


@pytest.mark.asyncio
async def test_complete_denied_request():
    """A denied doc request should return a denial message."""
    from approvals.router import ApprovalRequest, create_approval_in_db

    approval = ApprovalRequest(
        requesting_agent=COO_ID,
        owning_agent=OPS_MANAGER_ID,
        action="share_file",
        description="test",
        resource="test file",
        status=ApprovalStatus.DENIED,
    )
    await create_approval_in_db(approval)

    resp = await complete_doc_request(approval.id)
    assert "declined" in resp.answer.lower() or "denied" in resp.answer.lower()


@pytest.mark.asyncio
async def test_reset_demo():
    """Reset should clear all approvals, activity, messages, and sessions."""
    from approvals.router import ApprovalRequest, create_approval_in_db

    approval = ApprovalRequest(
        requesting_agent=COO_ID,
        owning_agent=OPS_MANAGER_ID,
        action="share_file",
        description="test",
        resource="test",
    )
    await create_approval_in_db(approval)

    # Add a conversation session
    _conversation_sessions["test-session"] = [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi there"},
    ]

    # Verify it's in the DB
    async with db.async_session() as session:
        row = await session.get(ApprovalRow, approval.id)
        assert row is not None

    result = await reset_demo()
    assert result["status"] == "ok"

    # Verify approval is gone
    async with db.async_session() as session:
        row = await session.get(ApprovalRow, approval.id)
        assert row is None

    # Verify conversation sessions cleared
    assert len(_conversation_sessions) == 0


# ---------------------------------------------------------------------------
# Session-based conversation history tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_session_id_returned_in_response():
    """Orchestration should return a session_id (generated if not provided)."""
    req = OrchestrateRequest(
        message="Are we on track for the marketplace redesign?",
        agent_id=COO_ID,
    )
    resp = await orchestrate(req)
    assert resp.session_id is not None
    assert len(resp.session_id) > 0


@pytest.mark.asyncio
async def test_session_id_preserved_across_calls():
    """When a session_id is provided, it should be preserved across calls."""
    session_id = "test-session-123"

    req1 = OrchestrateRequest(
        message="Are we on track for the marketplace redesign?",
        agent_id=COO_ID,
        session_id=session_id,
    )
    resp1 = await orchestrate(req1)
    assert resp1.session_id == session_id

    req2 = OrchestrateRequest(
        message="Tell me more about the blocker",
        agent_id=COO_ID,
        session_id=session_id,
    )
    resp2 = await orchestrate(req2)
    assert resp2.session_id == session_id


@pytest.mark.asyncio
async def test_session_history_populated():
    """After orchestration, both user message and assistant response should be in session."""
    session_id = "test-session-history"

    req = OrchestrateRequest(
        message="What's blocking the API dependency?",
        agent_id=COO_ID,
        session_id=session_id,
    )
    await orchestrate(req)

    # Session should have both user and assistant messages
    history = _conversation_sessions.get(session_id, [])
    assert len(history) == 2
    assert history[0]["role"] == "user"
    assert history[0]["content"] == "What's blocking the API dependency?"
    assert history[1]["role"] == "assistant"
    assert len(history[1]["content"]) > 0


@pytest.mark.asyncio
async def test_session_history_accumulates():
    """Multiple calls with same session_id should accumulate history."""
    session_id = "test-session-accumulate"

    req1 = OrchestrateRequest(
        message="Are we on track for the marketplace redesign?",
        agent_id=COO_ID,
        session_id=session_id,
    )
    await orchestrate(req1)

    req2 = OrchestrateRequest(
        message="What's blocking the API dependency?",
        agent_id=COO_ID,
        session_id=session_id,
    )
    await orchestrate(req2)

    history = _conversation_sessions.get(session_id, [])
    # 2 user messages + 2 assistant messages = 4
    assert len(history) == 4
    assert history[0]["role"] == "user"
    assert history[1]["role"] == "assistant"
    assert history[2]["role"] == "user"
    assert history[3]["role"] == "assistant"


# ---------------------------------------------------------------------------
# Streaming endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stream_marketplace_redesign():
    """Streaming: marketplace redesign query should stream steps, chunks, sources."""
    from httpx import ASGITransport, AsyncClient
    from main import app

    app.dependency_overrides[get_current_agent] = _override_auth(COO_ID)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/orchestrate/stream",
                json={
                    "message": "Are we on track for the marketplace redesign?",
                    "agent_id": str(COO_ID),
                },
            )

        assert resp.status_code == 200
        assert resp.headers["content-type"] == "text/event-stream; charset=utf-8"

        events = _parse_sse(resp.text)
        types = [e["type"] for e in events]

        assert "session" in types
        assert "step" in types
        assert "chunk" in types
        assert "sources" in types
        assert "done" in types
    finally:
        app.dependency_overrides.pop(get_current_agent, None)


@pytest.mark.asyncio
async def test_stream_returns_session_id():
    """Streaming: should emit a session event with session_id."""
    from httpx import ASGITransport, AsyncClient
    from main import app

    app.dependency_overrides[get_current_agent] = _override_auth(COO_ID)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/orchestrate/stream",
                json={
                    "message": "Are we on track for the marketplace redesign?",
                    "agent_id": str(COO_ID),
                },
            )

        events = _parse_sse(resp.text)
        session_events = [e for e in events if e["type"] == "session"]
        assert len(session_events) == 1
        assert "session_id" in session_events[0]
        assert len(session_events[0]["session_id"]) > 0
    finally:
        app.dependency_overrides.pop(get_current_agent, None)


@pytest.mark.asyncio
async def test_stream_preserves_provided_session_id():
    """Streaming: when session_id is provided, it should be echoed back."""
    from httpx import ASGITransport, AsyncClient
    from main import app

    my_session = "my-custom-session-456"
    app.dependency_overrides[get_current_agent] = _override_auth(COO_ID)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/orchestrate/stream",
                json={
                    "message": "Are we on track for the marketplace redesign?",
                    "agent_id": str(COO_ID),
                    "session_id": my_session,
                },
            )

        events = _parse_sse(resp.text)
        session_events = [e for e in events if e["type"] == "session"]
        assert session_events[0]["session_id"] == my_session
    finally:
        app.dependency_overrides.pop(get_current_agent, None)


@pytest.mark.asyncio
async def test_stream_unauthenticated_returns_401():
    """Streaming: unauthenticated request should return 401."""
    from httpx import ASGITransport, AsyncClient
    from main import app

    fake_id = "99999999-9999-9999-9999-999999999999"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/orchestrate/stream",
            json={"message": "Hello", "agent_id": fake_id},
        )
    assert resp.status_code == 401


def _parse_sse(text: str) -> list[dict]:
    """Parse SSE text into a list of event dicts."""
    events = []
    for line in text.strip().split("\n"):
        line = line.strip()
        if line.startswith("data: "):
            try:
                events.append(json.loads(line[6:]))
            except json.JSONDecodeError:
                pass
    return events
