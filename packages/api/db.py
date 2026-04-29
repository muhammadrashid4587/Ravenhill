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
    """Convert postgres://, postgresql:// to postgresql+asyncpg:// and strip
    psycopg-style query args asyncpg doesn't understand."""
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    # asyncpg rejects `sslmode=...` — it uses its own `ssl` kwarg. Strip it
    # from the URL; the caller sets ssl via connect_args below.
    for bad in ("?sslmode=disable", "&sslmode=disable", "?sslmode=require", "&sslmode=require"):
        url = url.replace(bad, "")
    return url


def _engine_connect_args(url: str) -> dict:
    """Disable SSL when talking to Fly's internal .flycast network — the
    Fly Postgres listens on plaintext there and resets on TLS handshake.
    Everything else defaults to SSL via asyncpg."""
    if ".flycast" in url or ".internal" in url:
        return {"ssl": False}
    return {}


_url = _ensure_async_url(settings.database_url)
# pool_pre_ping: Fly Postgres / pgbouncer drops idle connections, which
# otherwise surface as `asyncpg.InterfaceError: connection is closed` on
# the next request. Pre-ping validates + transparently replaces dead ones.
# pool_recycle: hard cap so no pooled connection outlives the server's
# idle timeout (~5 min on Fly).
engine = create_async_engine(
    _url,
    echo=False,
    connect_args=_engine_connect_args(_url),
    pool_pre_ping=True,
    pool_recycle=240,
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


# Deterministic UUID for the implicit "default" organization. Pre-existing
# seed agents and legacy rows that have no org yet get backfilled to this
# org on startup so queries with an org filter still return something
# during the v1 → multi-tenant transition. Any new signup creates a fresh
# Org; this one is only the landing pad for legacy / demo data.
DEFAULT_ORG_ID = uuid.UUID("00000000-0000-0000-0000-00000000beef")


class OrganizationRow(Base):
    """A tenant on Ravenhill. Every Agent belongs to exactly one Org (v1).

    Owns two invite paths:
      1. Per-email invites (AuthInviteRow.org_id) — single-use, scoped to
         one recipient address.
      2. A single rotatable share-link (`invite_code`) that anyone with
         the link can use to join. Setting `invite_code` to NULL disables
         the share-link flow without deleting the org.

    `invite_approval_required=True` means joining via the share-link
    creates a pending membership that an admin must approve before the
    user's agent is provisioned. Default is False for low-friction onboarding.
    """

    __tablename__ = "organizations"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    # URL-friendly short name, e.g. "frontbeach-advisors". Unique; used
    # in org-scoped routes (/o/<slug>) on the frontend later.
    slug = Column(String(100), nullable=False, unique=True)
    # Rotatable share-link token. NULL disables the share-link flow.
    invite_code = Column(String(64), nullable=True)
    invite_code_expires_at = Column(DateTime(timezone=True), nullable=True)
    invite_approval_required = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_organizations_slug", "slug"),
        Index("ix_organizations_invite_code", "invite_code"),
    )


class AgentRow(Base):
    __tablename__ = "agents"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    # Tenant anchor. Nullable during the v1 migration — new signups must
    # always set it, legacy rows get backfilled to DEFAULT_ORG_ID on
    # startup. Will be tightened to NOT NULL once backfill is complete.
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=True)
    # Role *within the org*: "admin" or "member". Separate from `role`
    # (which is the human-readable job title like "Head of Ops").
    org_role = Column(String(20), default="member", nullable=False)
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
    # Seniority for tier-aware routing — derived from role title on signup,
    # editable later. Routing logic prefers candidates with seniority <=
    # target_tier so junior questions don't accidentally page the CEO.
    seniority = Column(String(20), default="mid", nullable=False)
    scopes = Column(JSON, default=list)
    is_active = Column(Boolean, default=True)
    password_hash = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_agents_org", "org_id"),
    )


class ApprovalRow(Base):
    __tablename__ = "approvals"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=True)
    requesting_agent = Column(Uuid, nullable=False)
    owning_agent = Column(Uuid, nullable=False)
    action = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    resource = Column(Text, nullable=False)
    status = Column(String(20), default="pending")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_approvals_org", "org_id"),
    )


class ActivityRow(Base):
    __tablename__ = "activity"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=True)
    type = Column(String(50), nullable=False)
    from_agent = Column(String(200), nullable=False)
    to_agent = Column(String(200), nullable=True)
    description = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_activity_org", "org_id"),
    )


class MessageLedgerRow(Base):
    __tablename__ = "message_ledger"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=True)
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

    __table_args__ = (
        Index("ix_message_ledger_org", "org_id"),
    )


class AuthSessionRow(Base):
    __tablename__ = "auth_sessions"

    session_token = Column(String(128), primary_key=True)
    agent_id = Column(Uuid, ForeignKey("agents.id"), nullable=False)
    # Snapshot of the agent's org at session-creation time. Used to scope
    # every subsequent request without a JOIN. If the agent moves orgs
    # (admin re-assignment, rare), their sessions are invalidated.
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=True)
    email = Column(String(320), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_seen_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_auth_sessions_agent", "agent_id"),
        Index("ix_auth_sessions_expires", "expires_at"),
        Index("ix_auth_sessions_org", "org_id"),
    )


class ConversationMessageRow(Base):
    __tablename__ = "conversation_messages"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=True)
    session_id = Column(String(100), nullable=False)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_conversation_messages_session_created", "session_id", "created_at"),
        Index("ix_conversation_messages_org", "org_id"),
    )


class AuthInviteRow(Base):
    """Single-use magic-link invite issued by the admin endpoint.

    The token value itself is the primary key (URL-safe random). `used_at`
    is set on first consumption; subsequent lookups see it as used and 401.
    """

    __tablename__ = "auth_invites"

    token = Column(String(64), primary_key=True)
    # Which org this invite grants membership to. Nullable for legacy
    # self-serve sign-in invites (is_login_only=True) where the invite
    # simply re-authenticates an existing agent — those pull org from
    # the agent row, not the invite.
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=True)
    # When True the invite is a share-link redemption (anyone with the
    # org's invite_code can use this token). Otherwise it's email-scoped.
    is_share_link = Column(Boolean, default=False, nullable=False)
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
        Index("ix_auth_invites_org", "org_id"),
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
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=True)
    agent_id = Column(Uuid, ForeignKey("agents.id"), nullable=False)
    title = Column(String(500), nullable=False)
    raw_transcript = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    source = Column(String(50), default="paste")  # "paste" | "google_meet" | "zoom"
    source_meeting_id = Column(String(200), nullable=True)  # external meeting ID
    status = Column(String(20), default="processing")  # "processing" | "ready" | "archived"
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_meetings_org", "org_id"),
    )


class TaskRow(Base):
    __tablename__ = "tasks"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=True)
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

    __table_args__ = (
        Index("ix_tasks_org", "org_id"),
    )


class GraphNodeRow(Base):
    """Knowledge graph node. PERSON | TEAM | TOPIC per blueprint §2.10.

    Scoped by org: two orgs can each have a "PERSON: John Smith" node
    without colliding. The uniqueness key is (org_id, node_type, name).
    """

    __tablename__ = "graph_nodes"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=True)
    node_type = Column(String(20), nullable=False)
    name = Column(String(500), nullable=False)
    attributes = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("org_id", "node_type", "name", name="uq_graph_nodes_org_type_name"),
        Index("ix_graph_nodes_org_type", "org_id", "node_type"),
    )


class GraphEdgeRow(Base):
    """Knowledge graph edge. One row per (from, to, edge_type)."""

    __tablename__ = "graph_edges"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=True)
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
        Index("ix_graph_edges_org", "org_id"),
    )


class EventRow(Base):
    """Persisted RNE. Every signal from every platform lands here first."""

    __tablename__ = "events"

    event_id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=True)
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
        Index("ix_events_org_occurred", "org_id", "occurred_at"),
    )


class GoogleOAuthTokenRow(Base):
    """Per-agent Google OAuth tokens, encrypted at rest.

    One row per (org_id, agent_id). `access_token` and `refresh_token` are
    Fernet-encrypted before insert and decrypted on read via the helpers in
    `integrations.google_tokens`. Everything else is metadata needed to
    rebuild a `google.oauth2.credentials.Credentials` object.

    Google rotates access tokens every ~1h; the refresh token is long-lived
    and what actually proves continued consent. When `refresh_token` is
    NULL (rare — only on re-consent with `prompt=none`), the integration
    must force a new auth flow on expiry instead of silently refreshing.
    """

    __tablename__ = "google_oauth_tokens"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=False)
    agent_id = Column(Uuid, ForeignKey("agents.id"), nullable=False)
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=True)
    token_uri = Column(String(300), nullable=False)
    client_id = Column(String(300), nullable=False)
    client_secret = Column(Text, nullable=False)
    scopes = Column(JSON, default=list)
    expiry = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("org_id", "agent_id", name="uq_google_oauth_tokens_org_agent"),
        Index("ix_google_oauth_tokens_agent", "agent_id"),
        Index("ix_google_oauth_tokens_org", "org_id"),
    )


class SlackOAuthTokenRow(Base):
    """Per-agent Slack OAuth tokens, encrypted at rest.

    One row per (org_id, agent_id) — same isolation rule as Google. The
    bot token (xoxb-) and the user token (xoxp-) are both encrypted; we
    store the user token only when the OAuth response includes one (i.e.
    the user granted user-scope permissions in addition to bot scopes).

    `team_id` and `team_name` are kept in clear so the UI can render
    "Connected to Acme" without a decryption round-trip.
    """

    __tablename__ = "slack_oauth_tokens"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=False)
    agent_id = Column(Uuid, ForeignKey("agents.id"), nullable=False)
    bot_access_token = Column(Text, nullable=False)
    user_access_token = Column(Text, nullable=True)
    bot_user_id = Column(String(100), nullable=True)
    authed_user_id = Column(String(100), nullable=True)
    team_id = Column(String(100), nullable=False)
    team_name = Column(String(300), nullable=True)
    scope = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("org_id", "agent_id", name="uq_slack_oauth_tokens_org_agent"),
        Index("ix_slack_oauth_tokens_agent", "agent_id"),
        Index("ix_slack_oauth_tokens_org", "org_id"),
        Index("ix_slack_oauth_tokens_team", "team_id"),
    )


class MeetingFileRow(Base):
    __tablename__ = "meeting_files"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    meeting_id = Column(Uuid, ForeignKey("meetings.id"), nullable=False)
    filename = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    file_url = Column(String(1000), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class AgentCapabilityRow(Base):
    """Per-agent permission for each tool the agent can autonomously
    exercise. Drives the shadow-settings UI and gates real runtime paths
    (e.g. attempt_auto_reply consults `auto_reply_to_inbound_messages`).

    `permission` is one of `auto` / `ask` / `never` — same three states
    as the Claude Desktop connector model that inspired the UI.

    `source` is `default` (registry default), `user` (explicit override),
    or `learned` (suggested by the shadow observer based on captured
    behavior — surfaced as a hint in the UI before becoming sticky).
    """
    __tablename__ = "agent_capabilities"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id = Column(Uuid, ForeignKey("organizations.id"), nullable=False)
    agent_id = Column(Uuid, ForeignKey("agents.id"), nullable=False)
    tool_id = Column(String(100), nullable=False)
    permission = Column(String(20), nullable=False, default="ask")
    source = Column(String(20), nullable=False, default="default")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("agent_id", "tool_id", name="uq_agent_capability"),
        Index("ix_agent_capability_org", "org_id"),
        Index("ix_agent_capability_agent", "agent_id"),
    )


async def init_db():
    """Create all tables if they don't exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def alter_table_if_needed():
    """Add new columns to existing tables if they don't exist.

    This runs on every startup and is intentionally forgiving: each
    statement is wrapped in try/except so unsupported SQL dialects
    (SQLite in tests) and pre-applied migrations both silently pass.

    Runs AFTER init_db() so the organizations table already exists and
    AFTER seed_default_org() so the backfill UPDATEs have a valid org
    to reference.
    """
    default_org = str(DEFAULT_ORG_ID)
    statements: list[str] = [
            # --- Pre-org column additions (historical) ---
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS email VARCHAR(320)",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS topic_keys JSON",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS knowledge_entries JSON",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS documents JSON",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS trust_level VARCHAR(20) DEFAULT 'auto'",
            # Seniority migration in three idempotent steps — combined
            # 'ADD COLUMN ... NOT NULL DEFAULT' can choke on some
            # Postgres-pooler configurations (Supabase) when the table
            # rewrite times out. Splitting lets each step succeed
            # independently and per-statement transactions ensure a
            # later step doesn't poison the next.
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS seniority VARCHAR(20)",
            "UPDATE agents SET seniority = 'mid' WHERE seniority IS NULL",
            "ALTER TABLE agents ALTER COLUMN seniority SET DEFAULT 'mid'",
            "ALTER TABLE agents ALTER COLUMN seniority SET NOT NULL",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS role_description TEXT DEFAULT ''",
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_agents_email_nonempty ON agents (LOWER(email)) WHERE email IS NOT NULL AND email <> ''",
            "ALTER TABLE auth_invites ADD COLUMN IF NOT EXISTS is_login_only BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS password_hash VARCHAR(500)",

            # --- Multi-tenant: add org_id to every table ---
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS org_role VARCHAR(20) NOT NULL DEFAULT 'member'",
            "ALTER TABLE approvals ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)",
            "ALTER TABLE activity ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)",
            "ALTER TABLE message_ledger ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)",
            "ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)",
            "ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)",
            "ALTER TABLE auth_invites ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)",
            "ALTER TABLE auth_invites ADD COLUMN IF NOT EXISTS is_share_link BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)",
            "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)",
            "ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)",
            "ALTER TABLE graph_edges ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)",
            "ALTER TABLE events ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)",

            # --- Backfill: any row with NULL org_id belongs to the default org.
            #     Safe on fresh DBs (no matching rows) and idempotent on prod. ---
            f"UPDATE agents SET org_id = '{default_org}' WHERE org_id IS NULL",
            f"UPDATE approvals SET org_id = '{default_org}' WHERE org_id IS NULL",
            f"UPDATE activity SET org_id = '{default_org}' WHERE org_id IS NULL",
            f"UPDATE message_ledger SET org_id = '{default_org}' WHERE org_id IS NULL",
            f"UPDATE auth_sessions SET org_id = '{default_org}' WHERE org_id IS NULL",
            f"UPDATE conversation_messages SET org_id = '{default_org}' WHERE org_id IS NULL",
            f"UPDATE auth_invites SET org_id = '{default_org}' WHERE org_id IS NULL",
            f"UPDATE meetings SET org_id = '{default_org}' WHERE org_id IS NULL",
            f"UPDATE tasks SET org_id = '{default_org}' WHERE org_id IS NULL",
            f"UPDATE graph_nodes SET org_id = '{default_org}' WHERE org_id IS NULL",
            f"UPDATE graph_edges SET org_id = '{default_org}' WHERE org_id IS NULL",
            f"UPDATE events SET org_id = '{default_org}' WHERE org_id IS NULL",

            # --- graph_nodes uniqueness swap.
            #     Old: (node_type, name) — collides across orgs.
            #     New: (org_id, node_type, name) — safe.
            #     DROP first; the ADD is idempotent via name check. ---
            "ALTER TABLE graph_nodes DROP CONSTRAINT IF EXISTS uq_graph_nodes_type_name",
            "ALTER TABLE graph_nodes ADD CONSTRAINT uq_graph_nodes_org_type_name UNIQUE (org_id, node_type, name)",

            # --- Indexes on org_id columns (create_all adds these on fresh
            #     DBs; IF NOT EXISTS makes this safe on prod). ---
            "CREATE INDEX IF NOT EXISTS ix_agents_org ON agents (org_id)",
            "CREATE INDEX IF NOT EXISTS ix_approvals_org ON approvals (org_id)",
            "CREATE INDEX IF NOT EXISTS ix_activity_org ON activity (org_id)",
            "CREATE INDEX IF NOT EXISTS ix_message_ledger_org ON message_ledger (org_id)",
            "CREATE INDEX IF NOT EXISTS ix_auth_sessions_org ON auth_sessions (org_id)",
            "CREATE INDEX IF NOT EXISTS ix_conversation_messages_org ON conversation_messages (org_id)",
            "CREATE INDEX IF NOT EXISTS ix_auth_invites_org ON auth_invites (org_id)",
            "CREATE INDEX IF NOT EXISTS ix_meetings_org ON meetings (org_id)",
            "CREATE INDEX IF NOT EXISTS ix_tasks_org ON tasks (org_id)",
            "CREATE INDEX IF NOT EXISTS ix_graph_nodes_org_type ON graph_nodes (org_id, node_type)",
            "CREATE INDEX IF NOT EXISTS ix_graph_edges_org ON graph_edges (org_id)",
            "CREATE INDEX IF NOT EXISTS ix_events_org_occurred ON events (org_id, occurred_at)",

            # --- Google OAuth tokens: create_all handles fresh DBs; index
            #     statements here make this idempotent on existing prod DBs
            #     where the table already exists from a prior create_all. ---
            "CREATE INDEX IF NOT EXISTS ix_google_oauth_tokens_agent ON google_oauth_tokens (agent_id)",
            "CREATE INDEX IF NOT EXISTS ix_google_oauth_tokens_org ON google_oauth_tokens (org_id)",

            # --- Purge demo agents.
            #     Riley/Jordan/Sam/Alex were placeholders for the design-
            #     partner demo. Every table that FKs to agents.id needs a
            #     prior DELETE so the final DELETE FROM agents doesn't
            #     fail with a foreign-key violation. UUIDs match
            #     agents/seed.py constants. Per-statement transactions
            #     mean a missing table on a fresh DB doesn't poison the
            #     rest of the migration. ---
            # meeting_files cascades through meetings.id, so wipe them first.
            "DELETE FROM meeting_files WHERE meeting_id IN (SELECT id FROM meetings WHERE agent_id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004'))",
            "DELETE FROM tasks WHERE agent_id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004') OR meeting_id IN (SELECT id FROM meetings WHERE agent_id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004'))",
            "DELETE FROM meetings WHERE agent_id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004')",
            "DELETE FROM agent_capabilities WHERE agent_id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004')",
            "DELETE FROM message_ledger WHERE from_agent IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004') OR to_agent IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004')",
            "DELETE FROM activity WHERE agent_id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004')",
            "DELETE FROM approvals WHERE requesting_agent IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004') OR owning_agent IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004')",
            "DELETE FROM conversation_messages WHERE agent_id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004')",
            "DELETE FROM auth_sessions WHERE agent_id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004')",
            "DELETE FROM google_oauth_tokens WHERE agent_id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004')",
            "DELETE FROM slack_oauth_tokens WHERE agent_id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004')",
            "DELETE FROM agents WHERE id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004')",
        ]
    # Each statement runs in its own transaction. Postgres aborts the
    # whole transaction on the first failed statement — wrapping all
    # migrations in a single engine.begin() meant one bad ALTER could
    # silently roll back every subsequent migration in the same run.
    # This is how alembic and django migrations both behave.
    for col_def in statements:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(col_def))
        except Exception:
            pass  # Column/index/constraint might already exist, or this
            # specific dialect (SQLite in tests) doesn't support the SQL.
            # Per-statement transaction means we keep going regardless.


async def seed_default_org():
    """Ensure the default organization exists. Idempotent by primary key.

    This org is the landing pad for pre-org data: demo agents, legacy
    signups that were created before multi-tenancy, and anything else
    that has NULL `org_id`. Created with `invite_code=None` so it can't
    be joined via share-link — it's not a real tenant, just a container.
    """
    async with async_session() as session:
        existing = await session.get(OrganizationRow, DEFAULT_ORG_ID)
        if existing:
            return
        session.add(
            OrganizationRow(
                id=DEFAULT_ORG_ID,
                name="Ravenhill Demo",
                slug="default",
                invite_code=None,
                invite_approval_required=False,
            )
        )
        await session.commit()
        print("Seeded default organization.")


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
                # Refresh mutable demo fields in place; leave id/created_at/org_id
                # alone. org_id is skipped so an admin-initiated move of a demo
                # agent into a real org survives subsequent restarts.
                for key, value in agent_data.items():
                    if key in ("id", "created_at", "org_id"):
                        continue
                    setattr(existing, key, value)
            else:
                # Fresh seed: land the demo agents in the default org.
                session.add(AgentRow(org_id=DEFAULT_ORG_ID, **agent_data))
        await session.commit()
        print(f"Ensured {len(SEED_AGENTS)} demo agents (idempotent upsert).")


def with_org(stmt, model, org_id: uuid.UUID | None):
    """Attach an org_id filter to a SQLAlchemy statement.

    This is the single chokepoint for tenant scoping. Every query that
    reads rows from an org-scoped table should pass through it:

        rows = await session.execute(with_org(select(ApprovalRow), ApprovalRow, org_id))

    Centralizing the filter (instead of writing `.where(M.org_id == x)`
    at every call site) means we can audit the codebase by searching for
    direct references to an org-scoped model and flagging any that don't
    route through this helper.

    Passing `org_id=None` is a no-op — used in admin endpoints and tests
    that intentionally span tenants. Callers must be explicit about it;
    the default-org backfill is not a substitute for correct scoping.
    """
    if org_id is None:
        return stmt
    return stmt.where(model.org_id == org_id)


async def close_db():
    """Close the database engine."""
    await engine.dispose()
