"""Event → knowledge graph projection.

Per blueprint §2.3.5 walkthrough, every persisted RNE updates the graph:
- TOPIC node for the channel (#payments → topic 'payments')
- EXPERT_IN edge: actor → topic, +0.1 per relevant event
- COMMUNICATES_WITH edge: actor → each participant, +0.05 per event

Topic merging by Jaccard overlap (§2.10.1) is deferred; v1 uses exact-name
match. Direct messages (Slack channel ids starting with 'D') don't create
topics — they're 1:1, not subject-tagged.
"""

from __future__ import annotations

import logging
import re
from uuid import UUID

from events.models import EventType, RNEvent, SourcePlatform
from graph import queries
from graph.models import EdgeType, NodeType

logger = logging.getLogger(__name__)


# Per §2.3.5: deltas are small so the graph reflects sustained behavior,
# not single events.
EXPERT_IN_DELTA = 0.1
COMMUNICATES_WITH_DELTA = 0.05


# Channels that aren't real topics — they're org-wide noise, not expertise signal.
_NOISE_CHANNEL_NAMES = {"general", "random", "announcements", "off-topic", "watercooler"}

# Slack DM channel ids start with 'D'; group DMs start with 'G'. Neither
# represents a topic.
_SLACK_NON_TOPIC_PREFIXES = ("D", "G")

# Slack '_archived' suffix that gets appended to channel names sometimes.
_ARCHIVE_SUFFIX_RE = re.compile(r"[-_]?archived?$", re.IGNORECASE)


# Event types that count as expertise signal in a topic channel. Reactions and
# deletions don't — they're not authoring acts.
_EXPERTISE_SIGNAL_EVENTS = {
    EventType.MESSAGE_SENT,
    EventType.THREAD_REPLY,
    EventType.EMAIL_SENT,
    EventType.EMAIL_REPLIED,
    EventType.DOC_EDITED,
    EventType.TICKET_CREATED,
    EventType.TICKET_TRANSITIONED,
    EventType.TICKET_UPDATED,
}


def canonicalize_topic_name(channel: str) -> str | None:
    """Strip leading '#', archive suffix, and lowercase. Returns None if the
    channel shouldn't become a topic."""
    if not channel:
        return None
    name = channel.lstrip("#").strip().lower()
    name = _ARCHIVE_SUFFIX_RE.sub("", name)
    if not name or name in _NOISE_CHANNEL_NAMES:
        return None
    return name


def _is_topic_worthy_channel(event: RNEvent) -> bool:
    if event.source_platform != SourcePlatform.SLACK:
        return event.channel is not None  # other platforms: rely on caller
    raw_id = (event.metadata or {}).get("slack_channel_id") or ""
    if raw_id and raw_id[:1].upper() in _SLACK_NON_TOPIC_PREFIXES:
        return False
    return True


async def apply_event_to_graph(event: RNEvent) -> list[UUID]:
    """Project an RNE onto the graph. Returns the topic UUIDs touched.

    Idempotency note: edge deltas accumulate. The dedup at the event layer
    (unique on source_event_id) is what prevents double-counting — this
    function trusts that the caller only invokes it once per unique event.
    """

    touched_topics: list[UUID] = []

    if event.event_type not in _EXPERTISE_SIGNAL_EVENTS:
        return touched_topics

    if not _is_topic_worthy_channel(event):
        return touched_topics

    topic_name = canonicalize_topic_name(event.channel or "")
    if topic_name is None:
        return touched_topics

    topic = await queries.get_or_create_node(
        NodeType.TOPIC,
        topic_name,
        attributes={"source_channel": event.channel},
    )
    touched_topics.append(topic.id)

    await queries.upsert_edge(
        from_id=event.actor_id,
        to_id=topic.id,
        edge_type=EdgeType.EXPERT_IN,
        weight_delta=EXPERT_IN_DELTA,
    )

    # COMMUNICATES_WITH edges to known participants. Slack adapters don't
    # populate participants yet (would require channels.members lookup), so
    # this no-ops in the v1 wedge but is wired for when enrichment lands.
    for participant_id in event.participants:
        if participant_id == event.actor_id:
            continue
        await queries.upsert_edge(
            from_id=event.actor_id,
            to_id=participant_id,
            edge_type=EdgeType.COMMUNICATES_WITH,
            weight_delta=COMMUNICATES_WITH_DELTA,
        )

    return touched_topics
