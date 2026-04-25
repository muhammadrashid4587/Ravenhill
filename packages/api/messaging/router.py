"""Messaging API routes — real inter-agent communication.

Sender writes a `MessageLedgerRow`; recipient reads their inbox; either
side can post a reply that threads back via `in_reply_to`. This is the
chokepoint for agent-to-agent traffic — no LLM fabrication on the
sender's screen, every message is a real persisted row the recipient
can see.
"""

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from agents.models import Agent
from agents.runtime import attempt_auto_reply
from auth.deps import get_current_agent, get_current_agent_optional
import db
from db import DEFAULT_ORG_ID, AgentRow, MessageLedgerRow, with_org
from messaging.models import InterAgentMessage
from messaging.eto_client import eto_client

router = APIRouter()


def _scope_org(agent: AgentRow | None) -> UUID:
    return agent.org_id if agent and agent.org_id else DEFAULT_ORG_ID


# ---------- Real agent-to-agent messaging ----------


class SendAgentMessageRequest(BaseModel):
    to_agent_id: UUID
    content: str
    intent: str | None = None


class AgentMessageOut(BaseModel):
    """A persisted ledger entry as the UI consumes it.

    `id` is the canonical reference (used by reply / mark-read endpoints).
    `from_agent_id` and `to_agent_id` are the resolved UUIDs; `from_name`
    and `to_name` are denormalized for display so the inbox doesn't have
    to round-trip back to /agents.
    """
    id: UUID
    from_agent_id: UUID
    to_agent_id: UUID
    from_name: str
    to_name: str
    content: str
    intent: str | None
    in_reply_to: UUID | None
    status: str
    created_at: str


async def _row_to_message_out(
    session, row: MessageLedgerRow
) -> AgentMessageOut:
    """Resolve denormalized names for inbox display.

    The ledger stores `from_agent`/`to_agent` as string UUIDs to keep the
    schema flat, so the UI gets a name lookup here instead of N round-trips.
    """
    from_id = UUID(row.from_agent) if row.from_agent else None
    to_id = UUID(row.to_agent) if row.to_agent else None
    from_name = ""
    to_name = ""
    if from_id:
        f = await session.get(AgentRow, from_id)
        from_name = f.name if f else ""
    if to_id:
        t = await session.get(AgentRow, to_id)
        to_name = t.name if t else ""
    return AgentMessageOut(
        id=row.id,
        from_agent_id=from_id,
        to_agent_id=to_id,
        from_name=from_name,
        to_name=to_name,
        content=row.content or "",
        intent=row.intent,
        in_reply_to=UUID(row.in_reply_to) if row.in_reply_to else None,
        status=row.status or "delivered",
        created_at=row.created_at.isoformat() if row.created_at else "",
    )


@router.post("/agent", response_model=AgentMessageOut)
async def send_to_agent(
    req: SendAgentMessageRequest,
    caller: AgentRow = Depends(get_current_agent),
):
    """Send a real message from the caller's agent to another agent.

    Persists a `MessageLedgerRow` the recipient will see in their inbox.
    Does NOT generate any LLM content — the sender's screen shows what
    they wrote, the recipient sees it on their next inbox poll. Both
    parties must live in the same org.
    """
    if req.to_agent_id == caller.id:
        raise HTTPException(
            status_code=400,
            detail="cannot_message_self: use /api/agents/{id}/chat for self-chat",
        )
    if not (req.content and req.content.strip()):
        raise HTTPException(status_code=400, detail="empty_content")

    async with db.async_session() as session:
        recipient = await session.get(AgentRow, req.to_agent_id)
        if not recipient:
            raise HTTPException(status_code=404, detail="recipient_not_found")
        # Same-org check. NULLs on either side are treated as "default org"
        # so legacy pre-multi-tenancy rows keep working.
        sender_org = caller.org_id or DEFAULT_ORG_ID
        recipient_org = recipient.org_id or DEFAULT_ORG_ID
        if sender_org != recipient_org:
            raise HTTPException(status_code=403, detail="cross_org_messaging_not_allowed")

        row = MessageLedgerRow(
            org_id=caller.org_id,
            message_id=str(uuid4()),
            trace_id=str(uuid4()),
            type="QUERY",
            from_agent=str(caller.id),
            to_agent=str(req.to_agent_id),
            intent=req.intent,
            content=req.content.strip(),
            status="delivered",
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)

        # Recipient's agent attempts an auto-reply from their persona +
        # knowledge. Returns text only when grounded; defers to the human
        # otherwise. Failure here must NEVER block delivery — the inbound
        # row is already committed above, so a reply error just leaves
        # the message for the human to answer.
        try:
            recipient_agent = Agent(
                id=recipient.id,
                org_id=recipient.org_id,
                org_role=(recipient.org_role or "member"),
                name=recipient.name,
                role=recipient.role,
                role_description=recipient.role_description or "",
                departments=recipient.departments or [],
                knowledge_areas=recipient.knowledge_areas or [],
                knowledge_base=recipient.knowledge_base or "",
                knowledge_entries=recipient.knowledge_entries or [],
                topic_keys=recipient.topic_keys or [],
                documents=recipient.documents or [],
                trust_level=recipient.trust_level or "auto",
                scopes=recipient.scopes or [],
                is_active=recipient.is_active,
                created_at=recipient.created_at,
            )
            auto_text = await attempt_auto_reply(
                recipient_agent,
                sender_name=caller.name,
                incoming=req.content.strip(),
            )
        except Exception:
            auto_text = None

        if auto_text:
            reply = MessageLedgerRow(
                org_id=caller.org_id,
                message_id=str(uuid4()),
                trace_id=row.trace_id,
                type="QUERY",
                from_agent=str(req.to_agent_id),
                to_agent=str(caller.id),
                intent=req.intent,
                content=auto_text,
                status="delivered",
                in_reply_to=str(row.id),
            )
            session.add(reply)
            row.status = "replied"
            await session.commit()

        return await _row_to_message_out(session, row)


@router.get("/inbox", response_model=list[AgentMessageOut])
async def list_inbox(
    caller: AgentRow = Depends(get_current_agent),
    limit: int = 100,
):
    """Messages addressed to the caller, newest first.

    Includes both incoming agent-to-agent messages and replies threaded
    back via `in_reply_to`. Caller's outbox (messages they sent) is not
    in here — those live in `/api/messages/sent`.
    """
    me = str(caller.id)
    async with db.async_session() as session:
        stmt = with_org(
            select(MessageLedgerRow).where(MessageLedgerRow.to_agent == me),
            MessageLedgerRow,
            caller.org_id,
        )
        stmt = stmt.order_by(MessageLedgerRow.created_at.desc()).limit(limit)
        rows = (await session.execute(stmt)).scalars().all()
        return [await _row_to_message_out(session, r) for r in rows]


@router.get("/sent", response_model=list[AgentMessageOut])
async def list_sent(
    caller: AgentRow = Depends(get_current_agent),
    limit: int = 100,
):
    """Messages sent by the caller, newest first."""
    me = str(caller.id)
    async with db.async_session() as session:
        stmt = with_org(
            select(MessageLedgerRow).where(MessageLedgerRow.from_agent == me),
            MessageLedgerRow,
            caller.org_id,
        )
        stmt = stmt.order_by(MessageLedgerRow.created_at.desc()).limit(limit)
        rows = (await session.execute(stmt)).scalars().all()
        return [await _row_to_message_out(session, r) for r in rows]


@router.get("/thread/{other_agent_id}", response_model=list[AgentMessageOut])
async def thread_with_agent(
    other_agent_id: UUID,
    caller: AgentRow = Depends(get_current_agent),
    limit: int = 200,
):
    """Full conversation between caller and one other agent, oldest first.

    Used by the chat UI to render a direct-line thread that includes both
    sides of the exchange.
    """
    me = str(caller.id)
    other = str(other_agent_id)
    async with db.async_session() as session:
        stmt = with_org(
            select(MessageLedgerRow).where(
                ((MessageLedgerRow.from_agent == me) & (MessageLedgerRow.to_agent == other))
                | ((MessageLedgerRow.from_agent == other) & (MessageLedgerRow.to_agent == me))
            ),
            MessageLedgerRow,
            caller.org_id,
        )
        stmt = stmt.order_by(MessageLedgerRow.created_at.asc()).limit(limit)
        rows = (await session.execute(stmt)).scalars().all()
        return [await _row_to_message_out(session, r) for r in rows]


class ReplyRequest(BaseModel):
    content: str


@router.post("/{ledger_id}/reply", response_model=AgentMessageOut)
async def reply_to_message(
    ledger_id: UUID,
    req: ReplyRequest,
    caller: AgentRow = Depends(get_current_agent),
):
    """Reply to a message addressed to the caller.

    Creates a new ledger entry with `in_reply_to` set, sender = caller,
    recipient = original sender. Marks the original as `replied`.
    """
    if not (req.content and req.content.strip()):
        raise HTTPException(status_code=400, detail="empty_content")

    async with db.async_session() as session:
        original = await session.get(MessageLedgerRow, ledger_id)
        if not original:
            raise HTTPException(status_code=404, detail="message_not_found")
        if original.to_agent != str(caller.id):
            raise HTTPException(status_code=403, detail="not_recipient")

        sender_id = original.from_agent
        if not sender_id:
            raise HTTPException(status_code=400, detail="original_has_no_sender")

        reply = MessageLedgerRow(
            org_id=caller.org_id,
            message_id=str(uuid4()),
            trace_id=original.trace_id,
            type="QUERY",
            from_agent=str(caller.id),
            to_agent=sender_id,
            intent=original.intent,
            content=req.content.strip(),
            status="delivered",
            in_reply_to=str(original.id),
        )
        session.add(reply)
        original.status = "replied"
        await session.commit()
        await session.refresh(reply)
        return await _row_to_message_out(session, reply)


@router.post("/{ledger_id}/read")
async def mark_read(
    ledger_id: UUID,
    caller: AgentRow = Depends(get_current_agent),
):
    """Mark an inbox message as read. Idempotent."""
    async with db.async_session() as session:
        row = await session.get(MessageLedgerRow, ledger_id)
        if not row:
            raise HTTPException(status_code=404, detail="message_not_found")
        if row.to_agent != str(caller.id):
            raise HTTPException(status_code=403, detail="not_recipient")
        if row.status not in ("read", "replied"):
            row.status = "read"
            await session.commit()
        return {"status": row.status}


# ---------- Legacy endpoints (kept for back-compat with ETO stub) ----------


@router.post("/send")
async def send_message(message: InterAgentMessage):
    """Send an inter-agent message via the (stub) ETO transport.

    DEPRECATED for in-app agent-to-agent traffic — use POST /api/messages/agent
    instead, which persists to the ledger and propagates to the recipient.
    Kept for the eventual ETO cross-org integration.
    """
    result = await eto_client.send_message(message)
    return result


@router.get("/ledger")
async def get_message_ledger(
    agent: AgentRow | None = Depends(get_current_agent_optional),
):
    """Return the inter-agent message ledger for the caller's org."""
    org_id = _scope_org(agent)
    async with db.async_session() as session:
        stmt = with_org(select(MessageLedgerRow), MessageLedgerRow, org_id)
        stmt = stmt.order_by(MessageLedgerRow.created_at.desc()).limit(200)
        result = await session.execute(stmt)
        rows = result.scalars().all()
        messages = [
            {
                "message_id": r.message_id,
                "trace_id": r.trace_id,
                "type": r.type,
                "from_agent": r.from_agent,
                "to_agent": r.to_agent,
                "intent": r.intent,
                "status": r.status,
                "eto_tx_id": r.eto_tx_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
        return {"messages": messages, "count": len(messages)}
