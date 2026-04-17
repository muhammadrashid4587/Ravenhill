"""Database layer — SQLAlchemy async ORM with PostgreSQL (SQLite for tests).

All tables are created on startup. Demo agents are seeded if the agents table is empty.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.types import JSON

from config import settings


def _ensure_async_url(url: str) -> str:
    """Convert postgresql:// to postgresql+asyncpg:// if needed."""
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


engine = create_async_engine(_ensure_async_url(settings.database_url), echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class AgentRow(Base):
    __tablename__ = "agents"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    email = Column(String(320), nullable=True, unique=True)
    role = Column(String(200), nullable=False)
    role_description = Column(Text, default="")
    departments = Column(JSON, default=list)
    knowledge_areas = Column(JSON, default=list)
    knowledge_base = Column(Text, default="")
    topic_keys = Column(JSON, default=list)
    knowledge_entries = Column(JSON, default=list)
    documents = Column(JSON, default=list)
    trust_level = Column(String(20), default="auto")
    scopes = Column(JSON, default=list)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ApprovalRow(Base):
    __tablename__ = "approvals"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    requesting_agent = Column(Uuid, nullable=False)
    owning_agent = Column(Uuid, nullable=False)
    action = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    resource = Column(Text, nullable=False)
    status = Column(String(20), default="pending")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ActivityRow(Base):
    __tablename__ = "activity"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    type = Column(String(50), nullable=False)
    from_agent = Column(String(200), nullable=False)
    to_agent = Column(String(200), nullable=True)
    description = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class MessageLedgerRow(Base):
    __tablename__ = "message_ledger"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    message_id = Column(String(100))
    trace_id = Column(String(100), nullable=True)
    type = Column(String(50))
    from_agent = Column(String(100))
    to_agent = Column(String(100), nullable=True)
    intent = Column(Text, nullable=True)
    requires_approval = Column(Boolean, default=False)
    eto_tx_id = Column(String(100), nullable=True)
    status = Column(String(50), default="pending")
    in_reply_to = Column(String(100), nullable=True)
    content = Column(Text, nullable=True)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class AuthSessionRow(Base):
    __tablename__ = "auth_sessions"

    session_token = Column(String(128), primary_key=True)
    agent_id = Column(Uuid, ForeignKey("agents.id"), nullable=False)
    email = Column(String(320), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_seen_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_auth_sessions_agent", "agent_id"),
        Index("ix_auth_sessions_expires", "expires_at"),
    )


class ConversationMessageRow(Base):
    __tablename__ = "conversation_messages"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id = Column(String(100), nullable=False)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_conversation_messages_session_created", "session_id", "created_at"),
    )


class AuthInviteRow(Base):
    """Single-use magic-link invite issued by the admin endpoint.

    The token value itself is the primary key (URL-safe random). `used_at`
    is set on first consumption; subsequent lookups see it as used and 401.
    """

    __tablename__ = "auth_invites"

    token = Column(String(64), primary_key=True)
    email = Column(String(320), nullable=False)
    name = Column(String(200), nullable=False)
    role = Column(String(200), nullable=False, default="Employee")
    department = Column(String(200), nullable=False, default="General")
    # True when the invite is a self-serve sign-in token for an existing
    # account. The consume step skips the profile update in that case so
    # a re-login doesn't clobber user-edited fields.
    is_login_only = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_auth_invites_email", "email"),
        Index("ix_auth_invites_expires", "expires_at"),
    )


class AccessRequestRow(Base):
    """Waitlist entry from a public visitor. Admin reviews and, if approved,
    issues an AuthInvite. No automatic promotion."""

    __tablename__ = "access_requests"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    email = Column(String(320), nullable=False)
    name = Column(String(200), nullable=True)
    company = Column(String(200), nullable=True)
    role = Column(String(200), nullable=True)
    use_case = Column(Text, nullable=True)
    status = Column(String(20), default="pending")  # pending | invited | declined
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_access_requests_email", "email"),
        Index("ix_access_requests_status", "status"),
    )


class MeetingRow(Base):
    __tablename__ = "meetings"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    agent_id = Column(Uuid, ForeignKey("agents.id"), nullable=False)
    title = Column(String(500), nullable=False)
    raw_transcript = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    source = Column(String(50), default="paste")  # "paste" | "google_meet" | "zoom"
    source_meeting_id = Column(String(200), nullable=True)  # external meeting ID
    status = Column(String(20), default="processing")  # "processing" | "ready" | "archived"
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class TaskRow(Base):
    __tablename__ = "tasks"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    meeting_id = Column(Uuid, ForeignKey("meetings.id"), nullable=False)
    agent_id = Column(Uuid, ForeignKey("agents.id"), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(20), default="pending")  # "pending" | "in_progress" | "done" | "blocked"
    priority = Column(String(20), default="medium")  # "high" | "medium" | "low"
    source_excerpt = Column(Text, nullable=True)  # relevant transcript snippet
    due_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class GraphNodeRow(Base):
    """Knowledge graph node. PERSON | TEAM | TOPIC per blueprint §2.10."""

    __tablename__ = "graph_nodes"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    node_type = Column(String(20), nullable=False)
    name = Column(String(500), nullable=False)
    attributes = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("node_type", "name", name="uq_graph_nodes_type_name"),
        Index("ix_graph_nodes_type", "node_type"),
    )


class GraphEdgeRow(Base):
    """Knowledge graph edge. One row per (from, to, edge_type)."""

    __tablename__ = "graph_edges"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    from_id = Column(Uuid, ForeignKey("graph_nodes.id"), nullable=False)
    to_id = Column(Uuid, ForeignKey("graph_nodes.id"), nullable=False)
    edge_type = Column(String(30), nullable=False)
    weight = Column(Float, default=0.0, nullable=False)
    attributes = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("from_id", "to_id", "edge_type", name="uq_graph_edges_triple"),
        Index("ix_graph_edges_to_type", "to_id", "edge_type"),
        Index("ix_graph_edges_from_type", "from_id", "edge_type"),
    )


class EventRow(Base):
    """Persisted RNE. Every signal from every platform lands here first."""

    __tablename__ = "events"

    event_id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    event_type = Column(String(50), nullable=False)
    actor_id = Column(Uuid, nullable=False)

    source_platform = Column(String(30), nullable=False)
    source_event_id = Column(String(300), nullable=False)

    channel = Column(String(300), nullable=True)
    thread_id = Column(String(300), nullable=True)

    content_hash = Column(String(64), nullable=False)
    content_summary = Column(Text, nullable=True)

    topic_ids = Column(JSON, default=list)
    participants = Column(JSON, default=list)
    observer_ids = Column(JSON, default=list)

    trust_envelope = Column(JSON, nullable=False)

    requires_response = Column(Boolean, default=False)
    requires_verification = Column(Boolean, default=False)

    parent_event_id = Column(Uuid, nullable=True)
    forward_depth = Column(Integer, default=0)

    event_metadata = Column(JSON, default=dict)

    occurred_at = Column(DateTime(timezone=True), nullable=False)
    ingested_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("source_platform", "source_event_id", name="uq_events_source_dedup"),
        Index("ix_events_actor_occurred", "actor_id", "occurred_at"),
        Index("ix_events_thread", "thread_id"),
    )


class MeetingFileRow(Base):
    __tablename__ = "meeting_files"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    meeting_id = Column(Uuid, ForeignKey("meetings.id"), nullable=False)
    filename = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    file_url = Column(String(1000), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


async def init_db():
    """Create all tables if they don't exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def alter_table_if_needed():
    """Add new columns to existing tables if they don't exist."""
    async with engine.begin() as conn:
        for col_def in [
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS email VARCHAR(320)",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS topic_keys JSON",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS knowledge_entries JSON",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS documents JSON",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS trust_level VARCHAR(20) DEFAULT 'auto'",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS role_description TEXT DEFAULT ''",
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_agents_email_nonempty ON agents (LOWER(email)) WHERE email IS NOT NULL AND email <> ''",
            "ALTER TABLE auth_invites ADD COLUMN IF NOT EXISTS is_login_only BOOLEAN NOT NULL DEFAULT FALSE",
        ]:
            try:
                await conn.execute(text(col_def))
            except Exception:
                pass  # Column might already exist


async def seed_demo_agents():
    """Ensure the hard-coded demo agents exist. Idempotent: upserts by id so
    real signed-up users and their data are never wiped on restart.

    Demo agents use deterministic UUIDs (see agents/seed.py) so they remain
    stable across restarts and can be referenced from the UI."""
    from agents.seed import SEED_AGENTS

    async with async_session() as session:
        for agent_data in SEED_AGENTS:
            existing = await session.get(AgentRow, agent_data["id"])
            if existing:
                # Refresh mutable demo fields in place; leave id/created_at alone.
                for key, value in agent_data.items():
                    if key in ("id", "created_at"):
                        continue
                    setattr(existing, key, value)
            else:
                session.add(AgentRow(**agent_data))
        await session.commit()
        print(f"Ensured {len(SEED_AGENTS)} demo agents (idempotent upsert).")


async def close_db():
    """Close the database engine."""
    await engine.dispose()
