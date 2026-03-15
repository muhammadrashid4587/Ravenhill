"""Inter-agent message models — the protocol for agent-to-agent communication."""

from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class MessageType(str, Enum):
    QUERY = "QUERY"
    DOC_REQUEST = "DOC_REQUEST"
    ACTION = "ACTION"
    BROADCAST = "BROADCAST"


class PermissionContext(BaseModel):
    role: str
    department: str
    scopes: list[str] = []


class InterAgentMessage(BaseModel):
    """The wire format for all agent-to-agent communication.
    Transported via ETO infrastructure.
    """
    message_id: UUID = Field(default_factory=uuid4)
    type: MessageType
    from_agent: UUID
    to_agent: UUID | None = None  # None = routed by registry
    intent: str
    permission_ctx: PermissionContext
    requires_approval: bool = False
    ttl_seconds: int = 30
    payload: dict = {}
    trace_id: UUID = Field(default_factory=uuid4)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MessageResponse(BaseModel):
    """Response to an inter-agent message."""
    message_id: UUID = Field(default_factory=uuid4)
    in_reply_to: UUID
    from_agent: UUID
    content: str
    payload: dict = {}
    created_at: datetime = Field(default_factory=datetime.utcnow)
