"""Agent API routes — full CRUD backed by Postgres."""

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from agents.models import Agent, AgentMessage, AgentResponse
from agents.runtime import process_message
import db
from db import AgentRow

router = APIRouter()


class CreateAgentRequest(BaseModel):
    name: str
    role: str
    departments: list[str] = []
    knowledge_areas: list[str] = []
    knowledge_base: str = ""
    scopes: list[str] = []


class UpdateAgentRequest(BaseModel):
    name: str | None = None
    role: str | None = None
    departments: list[str] | None = None
    knowledge_areas: list[str] | None = None
    knowledge_base: str | None = None
    scopes: list[str] | None = None
    is_active: bool | None = None


def _row_to_agent(row: AgentRow) -> Agent:
    return Agent(
        id=row.id,
        name=row.name,
        role=row.role,
        departments=row.departments or [],
        knowledge_areas=row.knowledge_areas or [],
        knowledge_base=row.knowledge_base or "",
        scopes=row.scopes or [],
        is_active=row.is_active,
        created_at=row.created_at,
    )


@router.get("/", response_model=list[Agent])
async def list_agents():
    """List all agents."""
    async with db.async_session() as session:
        result = await session.execute(select(AgentRow).order_by(AgentRow.created_at))
        rows = result.scalars().all()
        return [_row_to_agent(r) for r in rows]


@router.get("/{agent_id}", response_model=Agent)
async def get_agent(agent_id: UUID):
    """Get a specific agent by ID."""
    async with db.async_session() as session:
        row = await session.get(AgentRow, agent_id)
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")
        return _row_to_agent(row)


@router.post("/", response_model=Agent, status_code=201)
async def create_agent(req: CreateAgentRequest):
    """Create a new agent."""
    async with db.async_session() as session:
        row = AgentRow(
            name=req.name,
            role=req.role,
            departments=req.departments,
            knowledge_areas=req.knowledge_areas,
            knowledge_base=req.knowledge_base,
            scopes=req.scopes,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return _row_to_agent(row)


@router.put("/{agent_id}", response_model=Agent)
async def update_agent(agent_id: UUID, req: UpdateAgentRequest):
    """Update an existing agent."""
    async with db.async_session() as session:
        row = await session.get(AgentRow, agent_id)
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")

        for field, value in req.model_dump(exclude_unset=True).items():
            setattr(row, field, value)

        await session.commit()
        await session.refresh(row)
        return _row_to_agent(row)


@router.delete("/{agent_id}")
async def delete_agent(agent_id: UUID):
    """Delete an agent."""
    async with db.async_session() as session:
        row = await session.get(AgentRow, agent_id)
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")

        await session.delete(row)
        await session.commit()
        return {"status": "deleted", "id": str(agent_id)}


@router.post("/{agent_id}/chat", response_model=AgentResponse)
async def chat_with_agent(agent_id: UUID, message: AgentMessage):
    """Send a message to an agent and get a response."""
    async with db.async_session() as session:
        row = await session.get(AgentRow, agent_id)
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")

        agent = _row_to_agent(row)
        response_text = await process_message(agent, message.content)

        return AgentResponse(
            agent_id=agent.id,
            agent_name=agent.name,
            content=response_text,
        )
