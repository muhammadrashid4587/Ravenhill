"""Orchestrator tests — validate the routing and approval logic."""

from uuid import UUID

import pytest
from unittest.mock import AsyncMock, patch

from agents.seed import SALES_AGENT_ID, FINANCE_AGENT_ID
from approvals.router import ApprovalRequest, ApprovalStatus, _pending_approvals
from orchestrator import orchestrate, complete_doc_request, reset_demo, OrchestrateRequest


@pytest.fixture(autouse=True)
def clear_approvals():
    """Clear approval store before each test."""
    _pending_approvals.clear()
    yield
    _pending_approvals.clear()


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
        assert resp.target_agent is None  # Answered directly, no routing
        assert resp.answer == "The Acme Corp deal is at $450K, closing next week."


@pytest.mark.asyncio
async def test_doc_request_creates_approval():
    """Demo 2: A doc request should create a pending approval."""
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

        # Verify approval was actually created in the store
        assert resp.approval_id in _pending_approvals
        approval = _pending_approvals[resp.approval_id]
        assert approval.requesting_agent == SALES_AGENT_ID
        assert approval.owning_agent == FINANCE_AGENT_ID
        assert approval.action == "share_file"
        assert approval.status.value == "pending"


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
    """Demo 2 end-to-end: doc request → approve → file delivered."""
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

        # Step 3: Approve it
        _pending_approvals[approval_id].status = ApprovalStatus.APPROVED

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
    approval = ApprovalRequest(
        requesting_agent=SALES_AGENT_ID,
        owning_agent=FINANCE_AGENT_ID,
        action="share_file",
        description="test",
        resource="test file",
        status=ApprovalStatus.DENIED,
    )
    _pending_approvals[approval.id] = approval

    resp = await complete_doc_request(approval.id)
    assert "denied" in resp.answer.lower()


@pytest.mark.asyncio
async def test_reset_demo():
    """Reset should clear all approvals."""
    approval = ApprovalRequest(
        requesting_agent=SALES_AGENT_ID,
        owning_agent=FINANCE_AGENT_ID,
        action="share_file",
        description="test",
        resource="test",
    )
    _pending_approvals[approval.id] = approval
    assert len(_pending_approvals) == 1

    result = await reset_demo()
    assert result["status"] == "ok"
    assert len(_pending_approvals) == 0
