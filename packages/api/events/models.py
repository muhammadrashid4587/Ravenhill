"""RNE (Ravenhill Native Event) Pydantic models + Trust Envelope."""

from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class Classification(str, Enum):
    PUBLIC = "PUBLIC"
    INTERNAL = "INTERNAL"
    RESTRICTED = "RESTRICTED"
    CONFIDENTIAL = "CONFIDENTIAL"


class SourcePlatform(str, Enum):
    SLACK = "SLACK"
    GMAIL = "GMAIL"
    GOOGLE_CALENDAR = "GOOGLE_CALENDAR"
    GOOGLE_DOCS = "GOOGLE_DOCS"
    GOOGLE_MEET = "GOOGLE_MEET"
    JIRA = "JIRA"
    GITHUB = "GITHUB"
    HRIS = "HRIS"
    MEETING_CHAT = "MEETING_CHAT"
    MANUAL = "MANUAL"


class EventType(str, Enum):
    MESSAGE_SENT = "message_sent"
    MESSAGE_EDITED = "message_edited"
    MESSAGE_DELETED = "message_deleted"
    REACTION_ADDED = "reaction_added"
    THREAD_REPLY = "thread_reply"
    EMAIL_SENT = "email_sent"
    EMAIL_REPLIED = "email_replied"
    MEETING_HELD = "meeting_held"
    MEETING_SCHEDULED = "meeting_scheduled"
    TICKET_CREATED = "ticket_created"
    TICKET_TRANSITIONED = "ticket_transitioned"
    TICKET_UPDATED = "ticket_updated"
    DOC_EDITED = "doc_edited"
    DOC_SHARED = "doc_shared"
    ORG_CHART_CHANGED = "org_chart_changed"


class TrustEnvelope(BaseModel):
    """Structurally enforced on every event. Can only be narrowed downstream."""

    classification: Classification = Classification.INTERNAL
    directional_scope: list[str] = Field(default_factory=list)  # team/person ids; empty = org-wide
    max_hops: int = 3
    source_confidence: float = 0.9
    self_only: bool = False  # for BCC recipients per blueprint §1.1.2


class RNEvent(BaseModel):
    """The Ravenhill Native Event — one shape for every signal from every platform."""

    event_id: UUID = Field(default_factory=uuid4)
    event_type: EventType
    actor_id: UUID  # PERSON node id in knowledge graph

    source_platform: SourcePlatform
    source_event_id: str  # external id (for dedup)

    channel: str | None = None  # slack channel name, email thread subject, etc.
    thread_id: str | None = None

    content_hash: str  # sha256 of raw content
    content_summary: str | None = None  # populated later by summarization subsystem

    topic_ids: list[UUID] = Field(default_factory=list)
    participants: list[UUID] = Field(default_factory=list)  # PERSON node ids
    observer_ids: list[UUID] = Field(default_factory=list)  # cc/bcc per blueprint §1.1.2

    trust_envelope: TrustEnvelope = Field(default_factory=TrustEnvelope)

    requires_response: bool = False
    requires_verification: bool = False

    parent_event_id: UUID | None = None  # for replies / thread structure
    forward_depth: int = 0  # §1.1.3

    metadata: dict[str, Any] = Field(default_factory=dict)

    occurred_at: datetime  # when it happened on the source platform
    ingested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EventIngestRequest(BaseModel):
    """Payload for POST /api/events — same as RNEvent but event_id + ingested_at are server-set."""

    event_type: EventType
    actor_id: UUID
    source_platform: SourcePlatform
    source_event_id: str
    channel: str | None = None
    thread_id: str | None = None
    content_hash: str
    content_summary: str | None = None
    topic_ids: list[UUID] = Field(default_factory=list)
    participants: list[UUID] = Field(default_factory=list)
    observer_ids: list[UUID] = Field(default_factory=list)
    trust_envelope: TrustEnvelope = Field(default_factory=TrustEnvelope)
    requires_response: bool = False
    requires_verification: bool = False
    parent_event_id: UUID | None = None
    forward_depth: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime


class EventIngestResponse(BaseModel):
    event_id: UUID
    deduplicated: bool  # true if source_event_id was already seen
