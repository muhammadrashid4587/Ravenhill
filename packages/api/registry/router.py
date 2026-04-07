"""Agent Registry — discovery service for finding the right agent, backed by Postgres."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from agents.models import Agent
import db
from db import AgentRow

router = APIRouter()


def _row_to_agent(row: AgentRow) -> Agent:
    return Agent(
        id=row.id,
        name=row.name,
        role=row.role,
        role_description=row.role_description or "",
        departments=row.departments or [],
        knowledge_areas=row.knowledge_areas or [],
        knowledge_base=row.knowledge_base or "",
        knowledge_entries=row.knowledge_entries or [],
        topic_keys=row.topic_keys or [],
        documents=row.documents or [],
        trust_level=row.trust_level or "auto",
        scopes=row.scopes or [],
        is_active=row.is_active,
        created_at=row.created_at,
    )


async def search_agents_by_query(query: str) -> list[Agent]:
    """Find agents whose knowledge areas match a query.

    TODO: Replace keyword matching with semantic search (pgvector).
    """
    query_lower = query.lower()
    words = query_lower.split()

    async with db.async_session() as session:
        result = await session.execute(
            select(AgentRow).where(AgentRow.is_active.is_(True))
        )
        rows = result.scalars().all()

    results = []
    for row in rows:
        areas = row.knowledge_areas or []
        topic_keys = row.topic_keys or []
        searchable = " ".join(
            areas + topic_keys + [row.role] + (row.departments or [])
        ).lower()
        if any(word in searchable for word in words):
            results.append(_row_to_agent(row))

    return results


@router.get("/", response_model=list[Agent])
async def list_registry():
    """List all registered agents and their metadata."""
    async with db.async_session() as session:
        result = await session.execute(
            select(AgentRow).where(AgentRow.is_active.is_(True)).order_by(AgentRow.name)
        )
        rows = result.scalars().all()
        return [_row_to_agent(r) for r in rows]


@router.get("/search")
async def search_agents(query: str) -> list[Agent]:
    """HTTP endpoint wrapping search_agents_by_query."""
    return await search_agents_by_query(query)


@router.get("/{agent_id}", response_model=Agent)
async def get_agent_metadata(agent_id: UUID):
    """Get an agent's registry entry."""
    async with db.async_session() as session:
        row = await session.get(AgentRow, agent_id)
        if not row:
            return None
        return _row_to_agent(row)
