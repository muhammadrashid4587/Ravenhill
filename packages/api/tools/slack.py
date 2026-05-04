"""Slack tools — list channels and summarize recent messages."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any
log = logging.getLogger("tools.slack")


async def has_slack(agent_id: str) -> bool:
    """Check if the agent has Slack connected."""
    from integrations.slack.adapter import _coerce_agent_uuid
    from integrations.slack.tokens import load_tokens

    uid = _coerce_agent_uuid(agent_id)
    if uid is None:
        return False
    return await load_tokens(uid) is not None


@dataclass
class SlackChannel:
    id: str
    name: str
    num_members: int = 0
    topic: str = ""
    is_private: bool = False


@dataclass
class ChannelListResult:
    channels: list[SlackChannel] = field(default_factory=list)


@dataclass
class ChannelMessagesResult:
    channel_name: str = ""
    messages: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None


async def slack_list_channels(agent_id: str, limit: int = 20) -> ChannelListResult:
    """List Slack channels the bot can see."""
    from integrations.slack.adapter import SlackNotConnected, list_channels

    try:
        raw = await list_channels(agent_id, limit=limit)
    except SlackNotConnected:
        return ChannelListResult()
    except Exception:
        log.exception("slack_list_channels failed for %s", agent_id[:8])
        return ChannelListResult()

    result = ChannelListResult(
        channels=[
            SlackChannel(
                id=c.get("id", ""),
                name=c.get("name", ""),
                num_members=c.get("num_members", 0),
                topic=c.get("topic", ""),
                is_private=c.get("is_private", False),
            )
            for c in raw
        ]
    )
    log.info("[slack.channels] agent=%s found=%d", agent_id[:8], len(result.channels))
    return result


async def slack_channel_messages(
    agent_id: str, channel_id: str, limit: int = 15
) -> ChannelMessagesResult:
    """Get recent messages from a Slack channel."""
    from integrations.slack.adapter import SlackNotConnected, list_messages

    try:
        raw = await list_messages(agent_id, channel_id, limit=limit)
    except SlackNotConnected:
        return ChannelMessagesResult(error="Slack is not connected.")
    except Exception as e:
        log.exception("slack_channel_messages failed for %s", agent_id[:8])
        return ChannelMessagesResult(error=str(e))

    return ChannelMessagesResult(
        messages=[
            {
                "user": m.get("user_name", m.get("user", "")),
                "text": m.get("text", ""),
                "ts": m.get("ts", ""),
            }
            for m in raw
            if not m.get("is_system")
        ]
    )


def format_channels_for_llm(result: ChannelListResult) -> str:
    if not result.channels:
        return "SLACK: No channels found."
    lines = [f"SLACK CHANNELS ({len(result.channels)}):"]
    for c in result.channels:
        priv = " (private)" if c.is_private else ""
        topic = f" — {c.topic}" if c.topic else ""
        lines.append(f"  - #{c.name}{priv} ({c.num_members} members){topic}")
    return "\n".join(lines)


def format_messages_for_llm(channel_name: str, result: ChannelMessagesResult) -> str:
    if result.error:
        return f"SLACK #{channel_name}: {result.error}"
    if not result.messages:
        return f"SLACK #{channel_name}: No recent messages."
    lines = [f"SLACK #{channel_name} — recent messages:"]
    for m in result.messages[:15]:
        user = m.get("user", "?")
        text = m.get("text", "")[:200]
        lines.append(f"  [{user}] {text}")
    return "\n".join(lines)
