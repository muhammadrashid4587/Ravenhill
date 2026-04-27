"""Agent Registry — discovery service for finding the right agent, backed by Postgres."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select

from agents.models import Agent
from auth.deps import get_current_agent_optional
import db
from db import DEFAULT_ORG_ID, AgentRow, with_org

router = APIRouter()


def _scope_org(agent: AgentRow | None) -> UUID:
    """Registry scope: authed caller's org, or default org for public demo."""
    return agent.org_id if agent and agent.org_id else DEFAULT_ORG_ID


def _row_to_agent(row: AgentRow) -> Agent:
    return Agent(
        id=row.id,
        org_id=row.org_id,
        org_role=(row.org_role or "member"),
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


async def search_agents_by_query(query: str, org_id: UUID | None = None) -> list[Agent]:
    """Find agents whose knowledge areas match a query.

    TODO: Replace keyword matching with semantic search (pgvector).
    """
    query_lower = query.lower()
    words = query_lower.split()

    async with db.async_session() as session:
        stmt = with_org(
            select(AgentRow).where(AgentRow.is_active.is_(True)),
            AgentRow,
            org_id,
        )
        result = await session.execute(stmt)
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
async def list_registry(
    agent: AgentRow | None = Depends(get_current_agent_optional),
):
    """List registered agents in the caller's org."""
    org_id = _scope_org(agent)
    async with db.async_session() as session:
        stmt = with_org(
            select(AgentRow).where(AgentRow.is_active.is_(True)),
            AgentRow,
            org_id,
        ).order_by(AgentRow.name)
        result = await session.execute(stmt)
        rows = result.scalars().all()
        return [_row_to_agent(r) for r in rows]


@router.get("/search")
async def search_agents(
    query: str,
    agent: AgentRow | None = Depends(get_current_agent_optional),
) -> list[Agent]:
    """HTTP endpoint wrapping search_agents_by_query, scoped to caller's org."""
    return await search_agents_by_query(query, _scope_org(agent))


@router.get("/{agent_id}", response_model=Agent)
async def get_agent_metadata(
    agent_id: UUID,
    agent: AgentRow | None = Depends(get_current_agent_optional),
):
    """Get an agent's registry entry, scoped to the caller's org."""
    org_id = _scope_org(agent)
    async with db.async_session() as session:
        row = await session.get(AgentRow, agent_id)
        if not row or (row.org_id is not None and row.org_id != org_id):
            return None
        return _row_to_agent(row)
