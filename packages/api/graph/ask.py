"""Natural-language 'who knows about X?' over the knowledge graph.

Per blueprint's v1 deliverable: 'Within 2 weeks, RavenHill will show you who
on your team actually knows what.' This is the surface that proves the
expertise graph works.

Topic extraction is deterministic (regex + node lookup) — no LLM. If a
match can't be made, the response says so honestly rather than guessing.
"""

from __future__ import annotations

import re

from sqlalchemy import select

import db
from graph import queries
from graph.models import ExpertHit, NodeType


# Prefixes we strip when pulling the topic out of a question.
_QUESTION_PREFIXES = [
    r"who\s+(on\s+(my|the|our)\s+team\s+)?knows\s+about\s+",
    r"who\s+(on\s+(my|the|our)\s+team\s+)?knows\s+",
    r"who\s+is\s+(the|an?)\s+expert\s+(on|in|with|about)\s+",
    r"who\s+are\s+the\s+experts?\s+(on|in|with|about)\s+",
    r"who\s+can\s+help\s+(me\s+)?with\s+",
    r"who\s+(should|could)\s+i\s+(ask|talk\s+to)\s+about\s+",
    r"experts?\s+(on|in|about)\s+",
    r"tell\s+me\s+about\s+",
    r"about\s+",
]

_PREFIX_RE = re.compile("^(?:" + "|".join(_QUESTION_PREFIXES) + ")", re.IGNORECASE)
_TRAILING_PUNCT_RE = re.compile(r"[?.!\s]+$")


def extract_topic_query(question: str) -> str:
    """Pull the candidate topic phrase out of a natural-language question.

    'Who on my team knows about deployment?' → 'deployment'
    'Experts on payments' → 'payments'
    'deployment' → 'deployment' (already a topic phrase)
    """
    cleaned = question.strip().lower()
    cleaned = _PREFIX_RE.sub("", cleaned)
    cleaned = _TRAILING_PUNCT_RE.sub("", cleaned)
    return cleaned.strip()


async def find_topic_node(query: str):
    """Resolve a query phrase to a TOPIC node. Tries exact match first,
    then substring containment in either direction. Returns None if no
    reasonable match exists — we'd rather say 'I don't know' than guess.
    """
    if not query:
        return None

    async with db.async_session() as session:
        exact = await session.execute(
            select(db.GraphNodeRow).where(
                db.GraphNodeRow.node_type == NodeType.TOPIC.value,
                db.GraphNodeRow.name == query,
            )
        )
        match = exact.scalar_one_or_none()
        if match is not None:
            return _to_topic_node(match)

        # Substring match — narrow by node_type so we scan only TOPIC rows.
        substring = await session.execute(
            select(db.GraphNodeRow).where(
                db.GraphNodeRow.node_type == NodeType.TOPIC.value,
            )
        )
        candidates = substring.scalars().all()

    # Prefer query-contains-name (e.g. 'payments processing' contains 'payments')
    # over name-contains-query (e.g. 'payments-processing' contains 'payments').
    for cand in candidates:
        if cand.name in query:
            return _to_topic_node(cand)
    for cand in candidates:
        if query in cand.name:
            return _to_topic_node(cand)
    return None


async def ask_who_knows(question: str, limit: int = 5, min_weight: float = 0.05) -> dict:
    """Answer a natural-language expertise question against the graph.

    Returns a dict with the resolved topic, ranked experts, and a one-line
    formatted answer suitable for chat surfaces.
    """
    extracted = extract_topic_query(question)
    topic_node = await find_topic_node(extracted)

    if topic_node is None:
        return {
            "question": question,
            "extracted_query": extracted,
            "topic": None,
            "experts": [],
            "answer": (
                f"I don't have signal on '{extracted}' yet. "
                "Once your team starts using a channel about it, "
                "I'll learn who knows what."
            ),
        }

    hits = await queries.who_knows_about(
        topic_id=topic_node.id, min_weight=min_weight, limit=limit
    )

    if not hits:
        return {
            "question": question,
            "extracted_query": extracted,
            "topic": topic_node.model_dump(mode="json"),
            "experts": [],
            "answer": f"I have a topic for '{topic_node.name}' but no one's posted enough to qualify as an expert yet.",
        }

    return {
        "question": question,
        "extracted_query": extracted,
        "topic": topic_node.model_dump(mode="json"),
        "experts": [_hit_summary(h) for h in hits],
        "answer": _format_answer(topic_node.name, hits),
    }


def _hit_summary(hit: ExpertHit) -> dict:
    attrs = hit.person.attributes or {}
    display = attrs.get("display_name") or hit.person.name
    return {
        "person_id": str(hit.person.id),
        "name": display,
        "weight": round(hit.weight, 3),
    }


def _format_answer(topic_name: str, hits: list[ExpertHit]) -> str:
    top = hits[:3]
    parts = []
    for h in top:
        attrs = h.person.attributes or {}
        display = attrs.get("display_name") or h.person.name
        parts.append(f"{display} ({h.weight:.2f})")
    joined = ", ".join(parts)
    suffix = f" (+{len(hits) - 3} more)" if len(hits) > 3 else ""
    return f"On '{topic_name}': {joined}{suffix}"


def _to_topic_node(row):
    from graph.models import GraphNode

    return GraphNode(
        id=row.id,
        node_type=NodeType.TOPIC,
        name=row.name,
        attributes=row.attributes or {},
        created_at=row.created_at,
        updated_at=row.updated_at,
    )
