"""Messaging API routes — inter-agent communication endpoints."""

from fastapi import APIRouter
from sqlalchemy import select

import db
from db import MessageLedgerRow
from messaging.models import InterAgentMessage
from messaging.eto_client import eto_client

router = APIRouter()


@router.post("/send")
async def send_message(message: InterAgentMessage):
    """Send an inter-agent message via ETO."""
    result = await eto_client.send_message(message)
    return result


@router.get("/ledger")
async def get_message_ledger():
    """Return the full inter-agent message ledger from the database."""
    async with db.async_session() as session:
        result = await session.execute(
            select(MessageLedgerRow).order_by(MessageLedgerRow.created_at.desc()).limit(200)
        )
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
