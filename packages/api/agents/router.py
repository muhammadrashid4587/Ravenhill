"""Agent API routes."""

from uuid import UUID

from fastapi import APIRouter, HTTPException

from agents.models import Agent, AgentMessage, AgentResponse
from agents.runtime import process_message
from agents.seed import DEMO_AGENTS

router = APIRouter()


@router.get("/", response_model=list[Agent])
async def list_agents():
    """List all active agents."""
    return list(DEMO_AGENTS.values())


@router.get("/{agent_id}", response_model=Agent)
async def get_agent(agent_id: UUID):
    """Get a specific agent by ID."""
    agent = DEMO_AGENTS.get(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.post("/{agent_id}/chat", response_model=AgentResponse)
async def chat_with_agent(agent_id: UUID, message: AgentMessage):
    """Send a message to an agent and get a response."""
    agent = DEMO_AGENTS.get(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    response_text = await process_message(agent, message.content)

    return AgentResponse(
        agent_id=agent.id,
        agent_name=agent.name,
        content=response_text,
    )
