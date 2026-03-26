"""Orchestrator — the brain that connects classify -> route -> answer.

Every agent-to-agent interaction creates a real InterAgentMessage routed
through the ETO client.  When ETO is live, messages are blockchain-verified.
When stubbed, they're tracked in the local ledger for observability.
"""

import json
from collections.abc import AsyncGenerator
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from activity.models import ActivityEntry, log_activity
from agents.models import Agent
from agents.runtime import classify_and_route, process_message, stream_message
from approvals.router import ApprovalRequest, create_approval_in_db
import db
from db import AgentRow, ApprovalRow, ActivityRow, MessageLedgerRow
from messaging.models import InterAgentMessage, MessageResponse, MessageType, PermissionContext
from messaging.eto_client import eto_client
from permissions.engine import requires_approval
from registry.router import search_agents_by_query

router = APIRouter()


class OrchestrateRequest(BaseModel):
    """Request body for the orchestrate endpoint."""
    message: str
    agent_id: UUID


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


def _row_to_agent(row: AgentRow) -> Agent:
    return Agent(
        id=row.id,
        name=row.name,
        role=row.role,
        department=row.department,
        knowledge_areas=row.knowledge_areas or [],
        knowledge_base=row.knowledge_base or "",
        scopes=row.scopes or [],
        is_active=row.is_active,
        created_at=row.created_at,
    )


async def _get_agent(agent_id: UUID) -> Agent | None:
    """Fetch an agent from the database."""
    async with db.async_session() as session:
        row = await session.get(AgentRow, agent_id)
        if not row:
            return None
        return _row_to_agent(row)


@router.post("/", response_model=OrchestrateResponse)
async def orchestrate(request: OrchestrateRequest):
    """Full orchestration flow — classify, route, and answer (or request approval)."""
    source = await _get_agent(request.agent_id)
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
    source_dept = source.department.lower()
    target_dept = department.lower()

    if source_dept == target_dept:
        steps.append(OrchestrateStep(
            label="Answering directly...",
            detail=f"{source.name} ({source.department})",
        ))

        answer = await process_message(source, request.message)

        await log_activity(ActivityEntry(
            type="answer",
            from_agent=source.name,
            description=f"Answered directly: {topic}",
        ))

        return OrchestrateResponse(
            source_agent=_agent_summary(source),
            intent=intent,
            steps=steps,
            answer=answer,
            trace_id=str(trace_id),
        )

    # Step 3: Find target agent via registry
    search_query = f"{department} {topic}"
    candidates = await search_agents_by_query(search_query)
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
        detail=f"{target.name} ({target.department})",
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
            department=source.department,
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

    await log_activity(ActivityEntry(
        type="route",
        from_agent=source.name,
        to_agent=target.name,
        description=f"Routed {topic} query to {target.department}",
    ))
    await log_activity(ActivityEntry(
        type="answer",
        from_agent=target.name,
        description=f"Answered: {topic}",
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
        await create_approval_in_db(approval)

        steps.append(OrchestrateStep(
            label="Approval required",
            detail=f"Waiting for {target.name} to approve",
        ))

        await log_activity(ActivityEntry(
            type="doc_request",
            from_agent=source.name,
            to_agent=target.name,
            description=f"Requested document: {message}",
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
    async with db.async_session() as session:
        approval_row = await session.get(ApprovalRow, approval_id)

    if not approval_row:
        raise HTTPException(status_code=404, detail="Approval not found")

    source = await _get_agent(approval_row.requesting_agent)
    target = await _get_agent(approval_row.owning_agent)
    if not source or not target:
        raise HTTPException(status_code=404, detail="Agent not found")

    if approval_row.status == "pending":
        return OrchestrateResponse(
            source_agent=_agent_summary(source),
            target_agent=_agent_summary(target),
            intent="DOC_REQUEST",
            steps=[OrchestrateStep(label="Waiting for approval...", status="pending")],
            answer=None,
            approval_id=approval_id,
        )

    if approval_row.status == "denied":
        return OrchestrateResponse(
            source_agent=_agent_summary(source),
            target_agent=_agent_summary(target),
            intent="DOC_REQUEST",
            steps=[OrchestrateStep(label="Request denied", detail="Access was denied")],
            answer="The document request was denied.",
            approval_id=approval_id,
        )

    # Approved — get the answer from the target agent
    answer = await process_message(target, approval_row.resource)

    # Record the file delivery through ETO
    response_msg = MessageResponse(
        in_reply_to=approval_id,
        from_agent=target.id,
        content=answer,
        payload={"type": "file_delivery"},
    )
    await eto_client.record_response(response_msg)

    await log_activity(ActivityEntry(
        type="approval",
        from_agent=target.name,
        description=f"Approved document share to {source.name}",
    ))

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


@router.post("/stream")
async def orchestrate_stream(request: OrchestrateRequest):
    """Streaming orchestration — classification is non-streaming, final answer streams via SSE."""
    source = await _get_agent(request.agent_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source agent not found")

    async def _generate() -> AsyncGenerator[str, None]:
        trace_id = uuid4()

        # Step 1: Classify (non-streaming, fast)
        classification = await classify_and_route(request.message)
        intent = classification.get("intent", "QUERY")
        department = classification.get("department", "unknown")
        topic = classification.get("topic", "unknown")

        yield _sse({"type": "step", "step": {
            "label": "Classifying intent...",
            "status": "done",
            "detail": f"{intent} about {department} — {topic}",
        }})

        # Step 2: Determine routing
        source_dept = source.department.lower()
        target_dept = department.lower()

        if source_dept == target_dept:
            yield _sse({"type": "step", "step": {
                "label": "Answering directly...",
                "status": "done",
                "detail": f"{source.name} ({source.department})",
            }})
            async for chunk in stream_message(source, request.message):
                yield _sse({"type": "chunk", "text": chunk})
            yield _sse({"type": "done", "trace_id": str(trace_id)})
            return

        # Step 3: Find target agent
        search_query = f"{department} {topic}"
        candidates = await search_agents_by_query(search_query)
        candidates = [a for a in candidates if a.id != source.id]

        if not candidates:
            yield _sse({"type": "step", "step": {
                "label": "No specialist found",
                "status": "done",
                "detail": f"No agent found for {department}",
            }})
            async for chunk in stream_message(source, request.message):
                yield _sse({"type": "chunk", "text": chunk})
            yield _sse({"type": "done", "trace_id": str(trace_id)})
            return

        target = candidates[0]
        yield _sse({"type": "step", "step": {
            "label": "Finding the right agent...",
            "status": "done",
            "detail": f"{target.name} ({target.department})",
        }})

        # Step 4: Handle based on intent
        if intent == "DOC_REQUEST":
            resp = await _handle_doc_request(
                source, target, request.message, [], trace_id,
            )
            for step in resp.steps:
                yield _sse({"type": "step", "step": step.model_dump()})
            if resp.answer:
                yield _sse({"type": "chunk", "text": resp.answer})
            if resp.approval_id:
                yield _sse({
                    "type": "approval",
                    "approval_id": str(resp.approval_id),
                })
            yield _sse({"type": "done", "trace_id": str(trace_id)})
            return

        # QUERY flow — route through ETO, then stream the answer
        msg_type = (
            MessageType(intent)
            if intent in MessageType.__members__
            else MessageType.QUERY
        )
        inter_msg = InterAgentMessage(
            type=msg_type,
            from_agent=source.id,
            to_agent=target.id,
            intent=request.message,
            permission_ctx=PermissionContext(
                role=source.role,
                department=source.department,
                scopes=source.scopes,
            ),
            trace_id=trace_id,
        )

        eto_result = await eto_client.send_message(inter_msg)
        yield _sse({"type": "step", "step": {
            "label": f"Message sent to {target.name}'s agent",
            "status": "done",
            "detail": f"via ETO — {eto_result['status']}",
        }})

        # Stream the answer from the target agent
        full_answer = ""
        async for chunk in stream_message(target, request.message):
            full_answer += chunk
            yield _sse({"type": "chunk", "text": chunk})

        # Record response through ETO
        response_msg = MessageResponse(
            in_reply_to=inter_msg.message_id,
            from_agent=target.id,
            content=full_answer,
        )
        await eto_client.record_response(response_msg)

        yield _sse({"type": "step", "step": {
            "label": f"{target.name}'s agent responded",
            "status": "done",
            "detail": "",
        }})

        yield _sse({"type": "done", "trace_id": str(trace_id)})

    return StreamingResponse(_generate(), media_type="text/event-stream")


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"


@router.post("/reset")
async def reset_demo():
    """Clear all demo state — approvals, activity, and message ledger."""
    async with db.async_session() as session:
        await session.execute(ApprovalRow.__table__.delete())
        await session.execute(ActivityRow.__table__.delete())
        await session.execute(MessageLedgerRow.__table__.delete())
        await session.commit()

    return {"status": "ok", "message": "Demo state reset"}


def _agent_summary(agent: Agent) -> dict:
    return {
        "id": str(agent.id),
        "name": agent.name,
        "role": agent.role,
        "department": agent.department,
    }
