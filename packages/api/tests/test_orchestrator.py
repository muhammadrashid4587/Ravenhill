"""Orchestrator tests — validate the routing and approval logic against the DB."""

import json
from uuid import UUID

import pytest
from unittest.mock import AsyncMock, patch

from agents.seed import SALES_AGENT_ID, FINANCE_AGENT_ID
from approvals.router import ApprovalStatus
import db
from db import ApprovalRow
from orchestrator import orchestrate, complete_doc_request, reset_demo, OrchestrateRequest


@pytest.mark.asyncio
async def test_query_routes_to_finance():
    """Demo 1: A finance question from Jordan should route to Karen."""
    with patch("orchestrator.classify_and_route", new_callable=AsyncMock) as mock_classify, \
         patch("orchestrator.process_message", new_callable=AsyncMock) as mock_process:

        mock_classify.return_value = {
            "intent": "QUERY",
            "department": "Finance",
            "topic": "revenue forecast",
            "summary": "Who owns Q4 revenue forecast?",
        }
        mock_process.return_value = "Karen Park owns the Q4 revenue forecast."

        req = OrchestrateRequest(message="Who owns Q4 revenue forecast?", agent_id=SALES_AGENT_ID)
        resp = await orchestrate(req)

        assert resp.intent == "QUERY"
        assert resp.target_agent is not None
        assert resp.target_agent["name"] == "Karen Park"
        assert resp.answer == "Karen Park owns the Q4 revenue forecast."
        assert resp.approval_id is None
        assert len(resp.steps) >= 2


@pytest.mark.asyncio
async def test_query_answers_directly_for_own_department():
    """A sales question from Jordan should be answered directly by Jordan."""
    with patch("orchestrator.classify_and_route", new_callable=AsyncMock) as mock_classify, \
         patch("orchestrator.process_message", new_callable=AsyncMock) as mock_process:

        mock_classify.return_value = {
            "intent": "QUERY",
            "department": "Sales",
            "topic": "deal status",
            "summary": "What's the Acme Corp deal status?",
        }
        mock_process.return_value = "The Acme Corp deal is at $450K, closing next week."

        req = OrchestrateRequest(
            message="What's the Acme Corp deal status?", agent_id=SALES_AGENT_ID
        )
        resp = await orchestrate(req)

        assert resp.intent == "QUERY"
        assert resp.target_agent is None
        assert resp.answer == "The Acme Corp deal is at $450K, closing next week."


@pytest.mark.asyncio
async def test_doc_request_creates_approval():
    """Demo 2: A doc request should create a pending approval in the DB."""
    with patch("orchestrator.classify_and_route", new_callable=AsyncMock) as mock_classify:

        mock_classify.return_value = {
            "intent": "DOC_REQUEST",
            "department": "Finance",
            "topic": "focus group results",
            "summary": "Get focus group results from Karen's team",
        }

        req = OrchestrateRequest(
            message="Get me the focus group results from Karen's team",
            agent_id=SALES_AGENT_ID,
        )
        resp = await orchestrate(req)

        assert resp.intent == "DOC_REQUEST"
        assert resp.approval_id is not None
        assert resp.answer is None
        assert resp.target_agent["name"] == "Karen Park"

        # Verify approval was created in the database
        async with db.async_session() as session:
            row = await session.get(ApprovalRow, resp.approval_id)
            assert row is not None
            assert row.requesting_agent == SALES_AGENT_ID
            assert row.owning_agent == FINANCE_AGENT_ID
            assert row.action == "share_file"
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
    """Every orchestration should produce at least a classification step."""
    with patch("orchestrator.classify_and_route", new_callable=AsyncMock) as mock_classify, \
         patch("orchestrator.process_message", new_callable=AsyncMock) as mock_process:

        mock_classify.return_value = {
            "intent": "QUERY",
            "department": "Finance",
            "topic": "budget",
            "summary": "What are the Q4 budget numbers?",
        }
        mock_process.return_value = "The Q4 budget is $5M."

        req = OrchestrateRequest(
            message="What are the Q4 budget numbers?", agent_id=SALES_AGENT_ID
        )
        resp = await orchestrate(req)

        assert len(resp.steps) >= 1
        assert resp.steps[0].label == "Classifying intent..."
        assert all(step.status == "done" for step in resp.steps)


@pytest.mark.asyncio
async def test_complete_doc_request_after_approval():
    """Demo 2 end-to-end: doc request -> approve -> file delivered."""
    with patch("orchestrator.classify_and_route", new_callable=AsyncMock) as mock_classify, \
         patch("orchestrator.process_message", new_callable=AsyncMock) as mock_process:

        # Step 1: Create doc request
        mock_classify.return_value = {
            "intent": "DOC_REQUEST",
            "department": "Finance",
            "topic": "focus group results",
            "summary": "Get focus group results",
        }

        req = OrchestrateRequest(
            message="Get me the focus group results", agent_id=SALES_AGENT_ID
        )
        resp = await orchestrate(req)
        approval_id = resp.approval_id
        assert approval_id is not None
        assert resp.answer is None

        # Step 2: Check status while still pending
        pending_resp = await complete_doc_request(approval_id)
        assert pending_resp.answer is None
        assert pending_resp.steps[0].status == "pending"

        # Step 3: Approve it in the database
        async with db.async_session() as session:
            row = await session.get(ApprovalRow, approval_id)
            row.status = "approved"
            await session.commit()

        # Step 4: Complete — should now return the file/answer
        mock_process.return_value = (
            "Focus group results: 82% want AI-assisted workflows."
        )
        completed = await complete_doc_request(approval_id)
        assert completed.answer is not None
        assert "82%" in completed.answer
        assert completed.approval_id == approval_id


@pytest.mark.asyncio
async def test_complete_denied_request():
    """A denied doc request should return a denial message."""
    from approvals.router import ApprovalRequest, create_approval_in_db

    approval = ApprovalRequest(
        requesting_agent=SALES_AGENT_ID,
        owning_agent=FINANCE_AGENT_ID,
        action="share_file",
        description="test",
        resource="test file",
        status=ApprovalStatus.DENIED,
    )
    await create_approval_in_db(approval)

    resp = await complete_doc_request(approval.id)
    assert "denied" in resp.answer.lower()


@pytest.mark.asyncio
async def test_reset_demo():
    """Reset should clear all approvals, activity, and messages from the DB."""
    from approvals.router import ApprovalRequest, create_approval_in_db

    approval = ApprovalRequest(
        requesting_agent=SALES_AGENT_ID,
        owning_agent=FINANCE_AGENT_ID,
        action="share_file",
        description="test",
        resource="test",
    )
    await create_approval_in_db(approval)

    # Verify it's in the DB
    async with db.async_session() as session:
        row = await session.get(ApprovalRow, approval.id)
        assert row is not None

    result = await reset_demo()
    assert result["status"] == "ok"

    # Verify it's gone
    async with db.async_session() as session:
        row = await session.get(ApprovalRow, approval.id)
        assert row is None


# ---------------------------------------------------------------------------
# Streaming endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stream_query_routes_to_finance():
    """Streaming: A finance question from Jordan should stream steps + answer chunks."""
    from httpx import ASGITransport, AsyncClient
    from main import app

    async def _mock_stream(agent, message):
        yield "Streamed answer about revenue."

    with patch("orchestrator.classify_and_route", new_callable=AsyncMock) as mock_classify, \
         patch("orchestrator.stream_message", side_effect=_mock_stream):

        mock_classify.return_value = {
            "intent": "QUERY",
            "department": "Finance",
            "topic": "revenue forecast",
            "summary": "Q4 revenue?",
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/orchestrate/stream",
                json={
                    "message": "Who owns Q4 revenue forecast?",
                    "agent_id": str(SALES_AGENT_ID),
                },
            )

        assert resp.status_code == 200
        assert resp.headers["content-type"] == "text/event-stream; charset=utf-8"

        events = _parse_sse(resp.text)
        types = [e["type"] for e in events]

        assert "step" in types
        assert "chunk" in types
        assert "done" in types

        step_events = [e for e in events if e["type"] == "step"]
        assert step_events[0]["step"]["label"] == "Classifying intent..."

        chunks = [e for e in events if e["type"] == "chunk"]
        assert any("revenue" in c["text"].lower() for c in chunks)


@pytest.mark.asyncio
async def test_stream_unknown_agent_returns_404():
    """Streaming: Non-existent agent should return 404."""
    from httpx import ASGITransport, AsyncClient
    from main import app

    fake_id = "99999999-9999-9999-9999-999999999999"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/orchestrate/stream",
            json={"message": "Hello", "agent_id": fake_id},
        )
    assert resp.status_code == 404


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
