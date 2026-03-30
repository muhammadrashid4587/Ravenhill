"""Database layer — SQLAlchemy async ORM with PostgreSQL (SQLite for tests).

All tables are created on startup. Demo agents are seeded if the agents table is empty.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, String, Text, Uuid
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
    departments = Column(JSON, default=list)
    knowledge_areas = Column(JSON, default=list)
    knowledge_base = Column(Text, default="")
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


async def seed_demo_agents():
    """Insert demo agents if the agents table is empty."""
    from agents.seed import SEED_AGENTS
    from sqlalchemy import select, func

    async with async_session() as session:
        count = await session.scalar(select(func.count()).select_from(AgentRow))
        if count and count > 0:
            return

        for agent_data in SEED_AGENTS:
            row = AgentRow(
                id=agent_data["id"],
                name=agent_data["name"],
                role=agent_data["role"],
                departments=agent_data["departments"],
                knowledge_areas=agent_data["knowledge_areas"],
                knowledge_base=agent_data["knowledge_base"],
                scopes=agent_data["scopes"],
                is_active=True,
            )
            session.add(row)

        await session.commit()
        print(f"Seeded {len(SEED_AGENTS)} demo agents.")


async def close_db():
    """Close the database engine."""
    await engine.dispose()
