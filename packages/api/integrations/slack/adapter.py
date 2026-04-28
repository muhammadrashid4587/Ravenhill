"""Slack Web API client — read-only surface used by the UI and orchestrator.

Wraps the handful of endpoints we need (`auth.test`, `team.info`,
`conversations.list`, `conversations.history`, `users.info`) on top of
httpx. Each call hydrates the bot token from the encrypted store; we
never cache decrypted tokens in process memory longer than one request.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import httpx

from integrations.slack.tokens import SlackTokenBundle, load_tokens

log = logging.getLogger("integrations.slack.adapter")

SLACK_API_BASE = "https://slack.com/api"


class SlackNotConnected(Exception):
    """Raised when the agent has no stored Slack tokens."""


class SlackAPIError(Exception):
    """Raised when Slack returns ok=false or an HTTP error."""


def _coerce_agent_uuid(agent_id: str | UUID) -> UUID | None:
    if not agent_id or agent_id == "demo":
        return None
    if isinstance(agent_id, UUID):
        return agent_id
    try:
        return UUID(str(agent_id))
    except (ValueError, AttributeError):
        return None


async def _tokens(agent_id: str | UUID) -> SlackTokenBundle:
    uid = _coerce_agent_uuid(agent_id)
    if uid is None:
        raise SlackNotConnected("No agent id; cannot resolve Slack tokens.")
    bundle = await load_tokens(uid)
    if bundle is None:
        raise SlackNotConnected("Agent has not connected Slack.")
    return bundle


async def _slack_get(path: str, token: str, params: dict | None = None) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{SLACK_API_BASE}/{path}",
            headers={"Authorization": f"Bearer {token}"},
            params=params or {},
        )
    resp.raise_for_status()
    body = resp.json()
    if not body.get("ok"):
        raise SlackAPIError(f"slack {path} failed: {body.get('error', 'unknown')}")
    return body


async def auth_test(agent_id: str) -> dict[str, Any]:
    """Verify the stored token still works. Returns Slack's auth.test payload."""
    bundle = await _tokens(agent_id)
    return await _slack_get("auth.test", bundle.bot_access_token)


async def team_info(agent_id: str) -> dict[str, Any]:
    bundle = await _tokens(agent_id)
    body = await _slack_get("team.info", bundle.bot_access_token)
    return body.get("team") or {}


async def list_channels(agent_id: str, *, limit: int = 100) -> list[dict[str, Any]]:
    """List public + private channels the bot can see, sorted by member count."""
    bundle = await _tokens(agent_id)
    body = await _slack_get(
        "conversations.list",
        bundle.bot_access_token,
        params={
            "exclude_archived": "true",
            "types": "public_channel,private_channel",
            "limit": str(limit),
        },
    )
    channels = body.get("channels") or []
    return [
        {
            "id": c.get("id"),
            "name": c.get("name"),
            "is_private": bool(c.get("is_private")),
            "is_member": bool(c.get("is_member")),
            "num_members": c.get("num_members") or 0,
            "topic": (c.get("topic") or {}).get("value") or "",
            "purpose": (c.get("purpose") or {}).get("value") or "",
        }
        for c in channels
        if c.get("id")
    ]


async def list_messages(
    agent_id: str,
    channel_id: str,
    *,
    limit: int = 30,
) -> list[dict[str, Any]]:
    """Recent messages in a channel. Caller resolves user names separately."""
    bundle = await _tokens(agent_id)
    body = await _slack_get(
        "conversations.history",
        bundle.bot_access_token,
        params={"channel": channel_id, "limit": str(limit)},
    )
    messages = body.get("messages") or []
    return [
        {
            "ts": m.get("ts"),
            "user": m.get("user"),
            "text": m.get("text") or "",
            "thread_ts": m.get("thread_ts"),
            "reply_count": m.get("reply_count") or 0,
            "subtype": m.get("subtype"),
        }
        for m in messages
    ]


async def users_info(agent_id: str, user_id: str) -> dict[str, Any]:
    bundle = await _tokens(agent_id)
    body = await _slack_get(
        "users.info",
        bundle.bot_access_token,
        params={"user": user_id},
    )
    user = body.get("user") or {}
    profile = user.get("profile") or {}
    return {
        "id": user.get("id"),
        "name": user.get("name"),
        "real_name": user.get("real_name") or profile.get("real_name"),
        "display_name": profile.get("display_name") or user.get("name"),
        "email": profile.get("email"),
        "image": profile.get("image_72") or profile.get("image_48"),
        "is_bot": bool(user.get("is_bot")),
    }
