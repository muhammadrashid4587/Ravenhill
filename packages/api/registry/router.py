"""Agent Registry — discovery service for finding the right agent to answer a query.

The registry knows every agent's role, department, and knowledge areas.
When Agent A asks a question, the registry narrows it down to the 1-5 agents
most likely to have the answer (targeted routing, not broadcast).
"""

from uuid import UUID

from fastapi import APIRouter

from agents.seed import DEMO_AGENTS
from agents.models import Agent

router = APIRouter()


def search_agents_by_query(query: str) -> list[Agent]:
    """Find agents whose knowledge areas match a query.

    Callable directly by the orchestrator — no HTTP needed.
    TODO: Replace keyword matching with semantic search (pgvector).
    """
    results = []
    query_lower = query.lower()

    for agent in DEMO_AGENTS.values():
        # Simple keyword match against knowledge areas and role
        searchable = " ".join(agent.knowledge_areas + [agent.role, agent.department]).lower()
        if any(word in searchable for word in query_lower.split()):
            results.append(agent)

    return results


@router.get("/", response_model=list[Agent])
async def list_registry():
    """List all registered agents and their metadata."""
    return list(DEMO_AGENTS.values())


@router.get("/search")
async def search_agents(query: str) -> list[Agent]:
    """HTTP endpoint wrapping search_agents_by_query."""
    return search_agents_by_query(query)


@router.get("/{agent_id}", response_model=Agent)
async def get_agent_metadata(agent_id: UUID):
    """Get an agent's registry entry."""
    return DEMO_AGENTS.get(agent_id)
