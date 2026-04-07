"""Database layer — SQLAlchemy async ORM with PostgreSQL (SQLite for tests).

All tables are created on startup. Demo agents are seeded if the agents table is empty.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, String, Text, Uuid, text
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


async def init_db():
    """Create all tables if they don't exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def alter_table_if_needed():
    """Add new columns to existing tables if they don't exist."""
    async with engine.begin() as conn:
        for col_def in [
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS topic_keys JSON",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS knowledge_entries JSON",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS documents JSON",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS trust_level VARCHAR(20) DEFAULT 'auto'",
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS role_description TEXT DEFAULT ''",
        ]:
            try:
                await conn.execute(text(col_def))
            except Exception:
                pass  # Column might already exist


async def seed_demo_agents():
    """Delete all existing agents and re-insert fresh seed data."""
    from agents.seed import SEED_AGENTS

    async with async_session() as session:
        # Always delete and reseed for demo consistency
        await session.execute(AgentRow.__table__.delete())
        for agent_data in SEED_AGENTS:
            row = AgentRow(**agent_data)
            session.add(row)
        await session.commit()
        print(f"Seeded {len(SEED_AGENTS)} demo agents.")


async def close_db():
    """Close the database engine."""
    await engine.dispose()
