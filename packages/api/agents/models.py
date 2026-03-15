"""Agent data models."""

from datetime import datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class Agent(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    role: str
    department: str
    knowledge_areas: list[str] = []
    knowledge_base: str = ""
    scopes: list[str] = []
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AgentMessage(BaseModel):
    """A message sent to or from an agent."""
    content: str
    agent_id: UUID
    conversation_id: UUID = Field(default_factory=uuid4)


class AgentResponse(BaseModel):
    """Response from an agent."""
    agent_id: UUID
    agent_name: str
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
