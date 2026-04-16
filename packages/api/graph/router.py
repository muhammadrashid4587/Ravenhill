"""Graph HTTP interface — read-heavy.

Mutations happen via the event pipeline (adapter → RNE → graph updater),
not via direct writes. These endpoints are for inspection + debugging +
chat query integration.
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from graph import queries
from graph.ask import ask_who_knows
from graph.models import (
    ExpertHit,
    GraphEdge,
    GraphNode,
    NodeType,
    UpsertEdgeRequest,
    UpsertNodeRequest,
)


class AskRequest(BaseModel):
    question: str
    limit: int = 5
    min_weight: float = 0.05


class AskResponse(BaseModel):
    question: str
    extracted_query: str
    topic: dict | None
    experts: list[dict]
    answer: str

router = APIRouter()


@router.get("/nodes", response_model=list[GraphNode])
async def list_nodes(
    node_type: NodeType | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
) -> list[GraphNode]:
    return await queries.list_nodes(node_type=node_type, limit=limit)


@router.get("/nodes/{node_id}", response_model=GraphNode)
async def get_node(node_id: UUID) -> GraphNode:
    node = await queries.get_node(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="node not found")
    return node


@router.post("/nodes", response_model=GraphNode, status_code=201)
async def upsert_node(req: UpsertNodeRequest) -> GraphNode:
    return await queries.get_or_create_node(req.node_type, req.name, req.attributes)


@router.post("/edges", response_model=GraphEdge, status_code=201)
async def upsert_edge(req: UpsertEdgeRequest) -> GraphEdge:
    return await queries.upsert_edge(
        from_id=req.from_id,
        to_id=req.to_id,
        edge_type=req.edge_type,
        weight_delta=req.weight_delta,
        set_weight=req.set_weight,
        attributes=req.attributes,
    )


@router.get("/experts", response_model=list[ExpertHit])
async def who_knows_about(
    topic_id: UUID,
    min_weight: float = Query(default=0.3, ge=0.0),
    limit: int = Query(default=10, ge=1, le=100),
) -> list[ExpertHit]:
    """Core v1 query: who on the team knows about this topic?"""
    return await queries.who_knows_about(topic_id=topic_id, min_weight=min_weight, limit=limit)


@router.get("/persons/{person_id}/expertise", response_model=list[ExpertHit])
async def expertise_of(
    person_id: UUID,
    min_weight: float = Query(default=0.1, ge=0.0),
) -> list[ExpertHit]:
    return await queries.expertise_of(person_id=person_id, min_weight=min_weight)


@router.get("/persons/{person_id}/manager", response_model=GraphNode | None)
async def get_manager(person_id: UUID) -> GraphNode | None:
    return await queries.get_manager(person_id)


@router.get("/teams/{team_id}/members", response_model=list[GraphNode])
async def team_members(team_id: UUID) -> list[GraphNode]:
    return await queries.team_members(team_id)


@router.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest) -> AskResponse:
    """The v1 deliverable: 'who knows about X?' over the live expertise graph.

    No LLM in the routing path — topic extraction is deterministic regex,
    matching is name lookup. The system says 'I don't know' instead of
    guessing when there's no signal.
    """
    result = await ask_who_knows(
        question=req.question, limit=req.limit, min_weight=req.min_weight
    )
    return AskResponse(**result)
