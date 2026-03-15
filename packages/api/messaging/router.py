"""Messaging API routes — inter-agent communication endpoints."""

from fastapi import APIRouter

from messaging.models import InterAgentMessage
from messaging.eto_client import eto_client

router = APIRouter()


@router.post("/send")
async def send_message(message: InterAgentMessage):
    """Send an inter-agent message via ETO."""
    result = await eto_client.send_message(message)
    return result
