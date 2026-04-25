"""Agent data models."""

from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class KnowledgeEntry(BaseModel):
    topic: str
    category: Literal[
        "project_status", "blocker", "dependency", "metric",
        "document_ref", "process", "contact", "timeline",
    ]
    content: str  # 1-3 sentences
    last_updated: str  # ISO date string like "2026-03-28"
    visibility: Literal["public", "team", "private"] = "public"
    references_agent: str | None = None  # agent_id if this points to another agent


class DocumentRef(BaseModel):
    name: str
    description: str
    requires_approval: bool = True


class Agent(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    # Tenant anchor carried everywhere the agent goes. Used by the
    # orchestrator to scope registry search, message routing, and
    # activity log writes to the agent's own org.
    org_id: UUID | None = None
    org_role: Literal["admin", "member"] = "member"
    name: str
    email: str = ""
    role: str
    role_description: str = ""
    departments: list[str] = []
    knowledge_areas: list[str] = []  # kept for backward compat
    knowledge_base: str = ""  # kept for backward compat
    knowledge_entries: list[KnowledgeEntry] = []
    topic_keys: list[str] = []
    documents: list[DocumentRef] = []
    trust_level: Literal["auto", "notify", "approve"] = "auto"
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
