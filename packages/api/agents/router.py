"""Agent API routes — full CRUD backed by Postgres, scoped to caller's org."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from agents.models import Agent, AgentMessage, AgentResponse
from agents.runtime import process_message
from auth.deps import get_current_agent, get_current_agent_optional
import db
from db import DEFAULT_ORG_ID, AgentRow, with_org

router = APIRouter()


class CreateAgentRequest(BaseModel):
    name: str
    role: str
    role_description: str = ""
    departments: list[str] = []
    knowledge_areas: list[str] = []
    knowledge_base: str = ""
    topic_keys: list[str] = []
    knowledge_entries: list[dict] = []
    documents: list[dict] = []
    trust_level: str = "auto"
    seniority: str | None = None  # if None, derived from role on create
    scopes: list[str] = []


class UpdateAgentRequest(BaseModel):
    name: str | None = None
    role: str | None = None
    role_description: str | None = None
    departments: list[str] | None = None
    knowledge_areas: list[str] | None = None
    knowledge_base: str | None = None
    topic_keys: list[str] | None = None
    knowledge_entries: list[dict] | None = None
    documents: list[dict] | None = None
    trust_level: str | None = None
    seniority: str | None = None
    scopes: list[str] | None = None
    is_active: bool | None = None


def _scope_org(agent: AgentRow | None) -> UUID:
    """Anonymous callers see the demo org; authed callers see only theirs."""
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
        seniority=row.seniority or "mid",
        scopes=row.scopes or [],
        is_active=row.is_active,
        created_at=row.created_at,
    )


@router.get("/", response_model=list[Agent])
async def list_agents(
    caller: AgentRow | None = Depends(get_current_agent_optional),
):
    """List agents in the caller's org. Anonymous callers see the demo org."""
    org_id = _scope_org(caller)
    async with db.async_session() as session:
        stmt = with_org(select(AgentRow), AgentRow, org_id).order_by(AgentRow.created_at)
        result = await session.execute(stmt)
        rows = result.scalars().all()
        return [_row_to_agent(r) for r in rows]


@router.get("/{agent_id}", response_model=Agent)
async def get_agent(
    agent_id: UUID,
    caller: AgentRow | None = Depends(get_current_agent_optional),
):
    """Get a specific agent — only if it lives in the caller's org."""
    org_id = _scope_org(caller)
    async with db.async_session() as session:
        row = await session.get(AgentRow, agent_id)
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")
        if row.org_id is not None and row.org_id != org_id:
            raise HTTPException(status_code=404, detail="Agent not found")
        return _row_to_agent(row)


@router.post("/", response_model=Agent, status_code=201)
async def create_agent(
    req: CreateAgentRequest,
    caller: AgentRow = Depends(get_current_agent),
):
    """Create a new agent in the caller's org."""
    from agents.seniority import derive_from_role
    async with db.async_session() as session:
        row = AgentRow(
            org_id=caller.org_id,
            name=req.name,
            role=req.role,
            role_description=req.role_description,
            departments=req.departments,
            knowledge_areas=req.knowledge_areas,
            knowledge_base=req.knowledge_base,
            topic_keys=req.topic_keys,
            knowledge_entries=req.knowledge_entries,
            documents=req.documents,
            trust_level=req.trust_level,
            seniority=req.seniority or derive_from_role(req.role),
            scopes=req.scopes,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return _row_to_agent(row)


@router.put("/{agent_id}", response_model=Agent)
async def update_agent(
    agent_id: UUID,
    req: UpdateAgentRequest,
    caller: AgentRow = Depends(get_current_agent),
):
    """Update an existing agent — only your own.

    When the role changes and the caller hasn't explicitly set their own
    seniority before, re-derive it from the new role title. This way
    'I'm a CTO' updates the routing tier without requiring a separate
    field. Once the user explicitly sets seniority via this endpoint,
    auto-derivation stops respecting role edits — explicit beats
    implicit.
    """
    from agents.seniority import derive_from_role
    async with db.async_session() as session:
        row = await session.get(AgentRow, agent_id)
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")
        if row.org_id is not None and row.org_id != caller.org_id:
            raise HTTPException(status_code=404, detail="Agent not found")

        updates = req.model_dump(exclude_unset=True)
        role_changed = "role" in updates and updates["role"] != row.role
        seniority_explicitly_set = "seniority" in updates

        for field, value in updates.items():
            setattr(row, field, value)

        if role_changed and not seniority_explicitly_set and row.seniority == "mid":
            # Auto-derive only if seniority is at the column default — a
            # user who set it themselves once shouldn't get overridden by
            # a role tweak.
            derived = derive_from_role(row.role)
            if derived != row.seniority:
                row.seniority = derived

        await session.commit()
        await session.refresh(row)
        return _row_to_agent(row)


@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: UUID,
    caller: AgentRow = Depends(get_current_agent),
):
    """Delete an agent — only your own."""
    async with db.async_session() as session:
        row = await session.get(AgentRow, agent_id)
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")
        if row.org_id is not None and row.org_id != caller.org_id:
            raise HTTPException(status_code=404, detail="Agent not found")

        await session.delete(row)
        await session.commit()
        return {"status": "deleted", "id": str(agent_id)}


@router.post("/{agent_id}/chat", response_model=AgentResponse)
async def chat_with_agent(
    agent_id: UUID,
    message: AgentMessage,
    caller: AgentRow | None = Depends(get_current_agent_optional),
):
    """Chat with an agent.

    Self-chat (talking to your own agent) runs the LLM locally to generate
    a reply in your own voice from your own knowledge.

    Talking to *someone else's* agent is NOT a chat — it's an inter-agent
    message. Those go through `POST /api/messages/agent` so they get
    persisted, surface in the recipient's inbox, and never produce a
    fabricated reply on the sender's screen.
    """
    async with db.async_session() as session:
        row = await session.get(AgentRow, agent_id)
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")

        # Anonymous callers can only chat with demo-org agents (the public
        # /demo flow). Authed callers can only chat with their own agent.
        if caller is None:
            if row.org_id is not None and row.org_id != DEFAULT_ORG_ID:
                raise HTTPException(status_code=401, detail="not_authenticated")
        else:
            if row.id != caller.id:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "use_inter_agent_messaging: chatting with another "
                        "agent must go through POST /api/messages/agent so "
                        "the recipient actually sees it"
                    ),
                )

        agent = _row_to_agent(row)
        response_text = await process_message(agent, message.content)

        return AgentResponse(
            agent_id=agent.id,
            agent_name=agent.name,
            content=response_text,
        )
