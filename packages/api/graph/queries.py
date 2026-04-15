"""Graph query + mutation helpers. All DB access goes through here.

Edge-weight semantics (§2.10):
- COMMUNICATES_WITH: incremented on each event (+0.05/event per walkthrough §2.3.5)
- EXPERT_IN / WORKS_ON: incremented when actor posts in topic channel (+0.1/event)
- REPORTS_TO / MEMBER_OF: binary, set to 1.0 when established
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select

import db
from graph.models import EdgeType, ExpertHit, GraphEdge, GraphNode, NodeType


async def get_or_create_node(
    node_type: NodeType, name: str, attributes: dict | None = None
) -> GraphNode:
    """Upsert on (node_type, name). Attributes are merged, not replaced."""
    async with db.async_session() as session:
        existing = await session.execute(
            select(db.GraphNodeRow).where(
                db.GraphNodeRow.node_type == node_type.value,
                db.GraphNodeRow.name == name,
            )
        )
        row = existing.scalar_one_or_none()
        if row is not None:
            if attributes:
                merged = {**(row.attributes or {}), **attributes}
                row.attributes = merged
                await session.commit()
            return _node_to_model(row)

        row = db.GraphNodeRow(
            node_type=node_type.value,
            name=name,
            attributes=attributes or {},
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return _node_to_model(row)


async def get_node(node_id: UUID) -> GraphNode | None:
    async with db.async_session() as session:
        result = await session.execute(
            select(db.GraphNodeRow).where(db.GraphNodeRow.id == node_id)
        )
        row = result.scalar_one_or_none()
        return _node_to_model(row) if row else None


async def upsert_edge(
    from_id: UUID,
    to_id: UUID,
    edge_type: EdgeType,
    weight_delta: float = 0.0,
    set_weight: float | None = None,
    attributes: dict | None = None,
) -> GraphEdge:
    """Create edge if absent, else add weight_delta to existing weight.

    If set_weight is provided, it replaces the weight (for binary edges like
    REPORTS_TO / MEMBER_OF). Attributes are merged.
    """
    async with db.async_session() as session:
        result = await session.execute(
            select(db.GraphEdgeRow).where(
                db.GraphEdgeRow.from_id == from_id,
                db.GraphEdgeRow.to_id == to_id,
                db.GraphEdgeRow.edge_type == edge_type.value,
            )
        )
        row = result.scalar_one_or_none()

        if row is None:
            row = db.GraphEdgeRow(
                from_id=from_id,
                to_id=to_id,
                edge_type=edge_type.value,
                weight=set_weight if set_weight is not None else weight_delta,
                attributes=attributes or {},
            )
            session.add(row)
        else:
            if set_weight is not None:
                row.weight = set_weight
            else:
                row.weight = (row.weight or 0.0) + weight_delta
            if attributes:
                row.attributes = {**(row.attributes or {}), **attributes}

        await session.commit()
        await session.refresh(row)
        return _edge_to_model(row)


async def who_knows_about(
    topic_id: UUID, min_weight: float = 0.3, limit: int = 10
) -> list[ExpertHit]:
    """Return ranked PERSON nodes with EXPERT_IN or WORKS_ON edges to the topic.

    Combines both edge types — EXPERT_IN (deep knowledge) and WORKS_ON (current
    engagement) — summing weights so current active contributors rank above
    historical experts who've moved on.
    """
    async with db.async_session() as session:
        result = await session.execute(
            select(db.GraphEdgeRow, db.GraphNodeRow)
            .join(db.GraphNodeRow, db.GraphEdgeRow.from_id == db.GraphNodeRow.id)
            .where(
                db.GraphEdgeRow.to_id == topic_id,
                db.GraphEdgeRow.edge_type.in_(
                    [EdgeType.EXPERT_IN.value, EdgeType.WORKS_ON.value]
                ),
                db.GraphEdgeRow.weight >= min_weight,
                db.GraphNodeRow.node_type == NodeType.PERSON.value,
            )
        )
        rows = result.all()

    # Sum weights per person (someone with both EXPERT_IN and WORKS_ON gets both).
    by_person: dict[UUID, tuple[db.GraphNodeRow, float]] = {}
    for edge, node in rows:
        existing_weight = by_person.get(node.id, (node, 0.0))[1]
        by_person[node.id] = (node, existing_weight + edge.weight)

    ranked = sorted(by_person.values(), key=lambda pair: pair[1], reverse=True)[:limit]
    return [
        ExpertHit(person=_node_to_model(n), weight=w, topic_id=topic_id)
        for n, w in ranked
    ]


async def get_manager(person_id: UUID) -> GraphNode | None:
    """Follow REPORTS_TO edge from person to their manager (one hop)."""
    async with db.async_session() as session:
        result = await session.execute(
            select(db.GraphNodeRow)
            .join(db.GraphEdgeRow, db.GraphEdgeRow.to_id == db.GraphNodeRow.id)
            .where(
                db.GraphEdgeRow.from_id == person_id,
                db.GraphEdgeRow.edge_type == EdgeType.REPORTS_TO.value,
            )
            .limit(1)
        )
        row = result.scalar_one_or_none()
        return _node_to_model(row) if row else None


async def team_members(team_id: UUID) -> list[GraphNode]:
    """Return PERSON nodes with MEMBER_OF edges into the team."""
    async with db.async_session() as session:
        result = await session.execute(
            select(db.GraphNodeRow)
            .join(db.GraphEdgeRow, db.GraphEdgeRow.from_id == db.GraphNodeRow.id)
            .where(
                db.GraphEdgeRow.to_id == team_id,
                db.GraphEdgeRow.edge_type == EdgeType.MEMBER_OF.value,
                db.GraphNodeRow.node_type == NodeType.PERSON.value,
            )
        )
        return [_node_to_model(r) for r in result.scalars().all()]


async def expertise_of(person_id: UUID, min_weight: float = 0.1) -> list[ExpertHit]:
    """Return topics a person is associated with via EXPERT_IN or WORKS_ON."""
    async with db.async_session() as session:
        result = await session.execute(
            select(db.GraphEdgeRow, db.GraphNodeRow)
            .join(db.GraphNodeRow, db.GraphEdgeRow.to_id == db.GraphNodeRow.id)
            .where(
                db.GraphEdgeRow.from_id == person_id,
                db.GraphEdgeRow.edge_type.in_(
                    [EdgeType.EXPERT_IN.value, EdgeType.WORKS_ON.value]
                ),
                db.GraphEdgeRow.weight >= min_weight,
                db.GraphNodeRow.node_type == NodeType.TOPIC.value,
            )
        )
        rows = result.all()

    by_topic: dict[UUID, tuple[db.GraphNodeRow, float]] = {}
    for edge, node in rows:
        existing = by_topic.get(node.id, (node, 0.0))[1]
        by_topic[node.id] = (node, existing + edge.weight)

    ranked = sorted(by_topic.values(), key=lambda p: p[1], reverse=True)
    return [
        ExpertHit(person=_node_to_model(n), weight=w, topic_id=n.id)
        for n, w in ranked
    ]


async def list_nodes(node_type: NodeType | None = None, limit: int = 100) -> list[GraphNode]:
    async with db.async_session() as session:
        stmt = select(db.GraphNodeRow)
        if node_type is not None:
            stmt = stmt.where(db.GraphNodeRow.node_type == node_type.value)
        stmt = stmt.order_by(db.GraphNodeRow.name).limit(limit)
        result = await session.execute(stmt)
        return [_node_to_model(r) for r in result.scalars().all()]


def _node_to_model(row: db.GraphNodeRow) -> GraphNode:
    return GraphNode(
        id=row.id,
        node_type=NodeType(row.node_type),
        name=row.name,
        attributes=row.attributes or {},
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _edge_to_model(row: db.GraphEdgeRow) -> GraphEdge:
    return GraphEdge(
        id=row.id,
        from_id=row.from_id,
        to_id=row.to_id,
        edge_type=EdgeType(row.edge_type),
        weight=row.weight,
        attributes=row.attributes or {},
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


