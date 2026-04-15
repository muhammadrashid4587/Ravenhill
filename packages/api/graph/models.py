"""Pydantic models for the knowledge graph."""

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class NodeType(str, Enum):
    PERSON = "PERSON"
    TEAM = "TEAM"
    TOPIC = "TOPIC"


class EdgeType(str, Enum):
    COMMUNICATES_WITH = "COMMUNICATES_WITH"  # PERSON → PERSON, weighted
    EXPERT_IN = "EXPERT_IN"  # PERSON → TOPIC, weighted
    WORKS_ON = "WORKS_ON"  # PERSON → TOPIC, weighted (active engagement)
    REPORTS_TO = "REPORTS_TO"  # PERSON → PERSON, binary (1.0)
    MEMBER_OF = "MEMBER_OF"  # PERSON → TEAM, binary (1.0)


class GraphNode(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    node_type: NodeType
    name: str  # display name; for TOPIC, also the canonical label for merging
    attributes: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class GraphEdge(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    from_id: UUID
    to_id: UUID
    edge_type: EdgeType
    weight: float = 0.0
    attributes: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ExpertHit(BaseModel):
    """Result of a who-knows-about query."""

    person: GraphNode
    weight: float
    topic_id: UUID


class UpsertNodeRequest(BaseModel):
    node_type: NodeType
    name: str
    attributes: dict[str, Any] = Field(default_factory=dict)


class UpsertEdgeRequest(BaseModel):
    from_id: UUID
    to_id: UUID
    edge_type: EdgeType
    weight_delta: float = 0.0  # added to existing weight; 0 creates edge if absent
    set_weight: float | None = None  # if provided, overrides delta (for binary edges)
    attributes: dict[str, Any] = Field(default_factory=dict)
