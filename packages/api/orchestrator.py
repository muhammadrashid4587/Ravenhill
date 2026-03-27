"""Orchestrator — the brain that connects classify → route → answer.

Every agent-to-agent interaction creates a real InterAgentMessage routed
through the ETO client.  When ETO is live, messages are blockchain-verified.
When stubbed, they're tracked in the local ledger for observability.

Demo 1 (QUERY): user asks Jordan → classify intent → find target agent via registry
  → send InterAgentMessage via ETO → target answers → response recorded → return answer
Demo 2 (DOC_REQUEST): same routing → requires_approval=True → create approval request → return pending
"""

from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents.models import Agent
from agents.runtime import classify_and_route, process_message
from agents.seed import DEMO_AGENTS
from approvals.router import ApprovalRequest, _pending_approvals
from messaging.models import InterAgentMessage, MessageResponse, MessageType, PermissionContext
from messaging.eto_client import eto_client
from permissions.engine import requires_approval
from registry.router import search_agents_by_query

router = APIRouter()


class OrchestrateRequest(BaseModel):
    """Request body for the orchestrate endpoint."""

    message: str
    agent_id: UUID  # The source agent (e.g., Jordan)


class OrchestrateStep(BaseModel):
    label: str
    status: str = "done"
    detail: str = ""


class OrchestrateResponse(BaseModel):
    source_agent: dict
    target_agent: dict | None = None
    intent: str
    steps: list[OrchestrateStep] = []
    answer: str | None = None
    approval_id: UUID | None = None
    trace_id: str | None = None


@router.post("/", response_model=OrchestrateResponse)
async def orchestrate(request: OrchestrateRequest):
    """Full orchestration flow — classify, route, and answer (or request approval)."""
    source = DEMO_AGENTS.get(request.agent_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source agent not found")

    steps: list[OrchestrateStep] = []
    trace_id = uuid4()

    # Step 1: Classify intent and extract routing info
    classification = await classify_and_route(request.message)
    intent = classification.get("intent", "QUERY")
    department = classification.get("department", "unknown")
    topic = classification.get("topic", "unknown")

    steps.append(OrchestrateStep(
        label="Classifying intent...",
        detail=f"{intent} about {department} — {topic}",
    ))

    # Step 2: Determine if source agent can answer directly
    source_depts = [d.lower() for d in source.departments]
    target_dept = department.lower()

    if target_dept in source_depts:
        steps.append(OrchestrateStep(
            label="Answering directly...",
            detail=f"{source.name} ({', '.join(source.departments)})",
        ))

        answer = await process_message(source, request.message)

        return OrchestrateResponse(
            source_agent=_agent_summary(source),
            intent=intent,
            steps=steps,
            answer=answer,
            trace_id=str(trace_id),
        )

    # Step 3: Find target agent via registry
    search_query = f"{department} {topic}"
    candidates = search_agents_by_query(search_query)
    candidates = [a for a in candidates if a.id != source.id]

    if not candidates:
        steps.append(OrchestrateStep(
            label="No specialist found",
            detail=f"No agent found for {department}",
        ))
        answer = await process_message(source, request.message)
        return OrchestrateResponse(
            source_agent=_agent_summary(source),
            intent=intent,
            steps=steps,
            answer=answer,
            trace_id=str(trace_id),
        )

    target = candidates[0]
    steps.append(OrchestrateStep(
        label="Finding the right agent...",
        detail=f"{target.name} ({', '.join(target.departments)})",
    ))

    # Step 4: Handle based on intent
    if intent == "DOC_REQUEST":
        return await _handle_doc_request(source, target, request.message, steps, trace_id)

    # QUERY flow — send InterAgentMessage via ETO, then get answer
    msg_type = MessageType(intent) if intent in MessageType.__members__ else MessageType.QUERY
    inter_msg = InterAgentMessage(
        type=msg_type,
        from_agent=source.id,
        to_agent=target.id,
        intent=request.message,
        permission_ctx=PermissionContext(
            role=source.role,
            departments=source.departments,
            scopes=source.scopes,
        ),
        trace_id=trace_id,
    )

    # Route through ETO
    eto_result = await eto_client.send_message(inter_msg)
    steps.append(OrchestrateStep(
        label=f"Message sent to {target.name}'s agent",
        detail=f"via ETO — {eto_result['status']}",
    ))

    # Target agent processes and responds
    answer = await process_message(target, request.message)

    # Record the response through ETO
    response_msg = MessageResponse(
        in_reply_to=inter_msg.message_id,
        from_agent=target.id,
        content=answer,
    )
    await eto_client.record_response(response_msg)

    steps.append(OrchestrateStep(
        label=f"{target.name}'s agent responded",
    ))

    return OrchestrateResponse(
        source_agent=_agent_summary(source),
        target_agent=_agent_summary(target),
        intent=intent,
        steps=steps,
        answer=answer,
        trace_id=str(trace_id),
    )


async def _handle_doc_request(
    source: Agent,
    target: Agent,
    message: str,
    steps: list[OrchestrateStep],
    trace_id: UUID,
) -> OrchestrateResponse:
    """Handle a document request — send via ETO, create approval, return pending."""
    perm_ctx = PermissionContext(
        role=source.role,
        department=source.department,
        scopes=source.scopes,
    )

    # Send the doc request through ETO
    inter_msg = InterAgentMessage(
        type=MessageType.DOC_REQUEST,
        from_agent=source.id,
        to_agent=target.id,
        intent=message,
        permission_ctx=perm_ctx,
        requires_approval=True,
        trace_id=trace_id,
    )
    eto_result = await eto_client.send_message(inter_msg)

    # Also request the file through ETO
    await eto_client.request_file(
        from_agent=str(source.id),
        to_agent=str(target.id),
        file_description=message,
    )

    steps.append(OrchestrateStep(
        label=f"Document request sent to {target.name}",
        detail=f"via ETO — {eto_result['status']}",
    ))

    needs_approval = requires_approval(perm_ctx, "share_file")

    if needs_approval:
        approval = ApprovalRequest(
            requesting_agent=source.id,
            owning_agent=target.id,
            action="share_file",
            description=f"{source.name} is requesting a document from {target.name}",
            resource=message,
        )
        _pending_approvals[approval.id] = approval

        steps.append(OrchestrateStep(
            label="Approval required",
            detail=f"Waiting for {target.name} to approve",
        ))

        return OrchestrateResponse(
            source_agent=_agent_summary(source),
            target_agent=_agent_summary(target),
            intent="DOC_REQUEST",
            steps=steps,
            answer=None,
            approval_id=approval.id,
            trace_id=str(trace_id),
        )

    # No approval needed
    answer = await process_message(target, message)
    return OrchestrateResponse(
        source_agent=_agent_summary(source),
        target_agent=_agent_summary(target),
        intent="DOC_REQUEST",
        steps=steps,
        answer=answer,
        trace_id=str(trace_id),
    )


@router.get("/approval/{approval_id}/complete", response_model=OrchestrateResponse)
async def complete_doc_request(approval_id: UUID):
    """After approval is granted, complete the doc request and return the file/answer."""
    approval = _pending_approvals.get(approval_id)
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")

    if approval.status.value == "pending":
        return OrchestrateResponse(
            source_agent=_agent_summary(DEMO_AGENTS[approval.requesting_agent]),
            target_agent=_agent_summary(DEMO_AGENTS[approval.owning_agent]),
            intent="DOC_REQUEST",
            steps=[OrchestrateStep(label="Waiting for approval...", status="pending")],
            answer=None,
            approval_id=approval_id,
        )

    if approval.status.value == "denied":
        return OrchestrateResponse(
            source_agent=_agent_summary(DEMO_AGENTS[approval.requesting_agent]),
            target_agent=_agent_summary(DEMO_AGENTS[approval.owning_agent]),
            intent="DOC_REQUEST",
            steps=[OrchestrateStep(label="Request denied", detail="Access was denied")],
            answer="The document request was denied.",
            approval_id=approval_id,
        )

    # Approved — get the answer from the target agent
    target = DEMO_AGENTS[approval.owning_agent]
    source = DEMO_AGENTS[approval.requesting_agent]
    answer = await process_message(target, approval.resource)

    # Record the file delivery through ETO
    response_msg = MessageResponse(
        in_reply_to=approval_id,  # link back to the approval
        from_agent=target.id,
        content=answer,
        payload={"type": "file_delivery"},
    )
    await eto_client.record_response(response_msg)

    return OrchestrateResponse(
        source_agent=_agent_summary(source),
        target_agent=_agent_summary(target),
        intent="DOC_REQUEST",
        steps=[
            OrchestrateStep(label="Approval granted", detail=f"{target.name} approved"),
            OrchestrateStep(label="File delivered via ETO"),
        ],
        answer=answer,
        approval_id=approval_id,
    )


@router.post("/reset")
async def reset_demo():
    """Clear all state for a fresh demo. Wipes pending approvals and message ledger."""
    from messaging.eto_client import message_ledger
    _pending_approvals.clear()
    message_ledger.clear()
    return {"status": "ok", "message": "Demo state reset"}


def _agent_summary(agent: Agent) -> dict:
    return {
        "id": str(agent.id),
        "name": agent.name,
        "role": agent.role,
        "departments": agent.departments,
    }
