"""Slack OAuth v2 — browser handshake to mint per-agent bot/user tokens.

We do the OAuth dance with raw httpx instead of pulling in slack_sdk. The
OAuth surface is two endpoints (`oauth/v2/authorize` redirect + `oauth.v2.access`
token exchange) and the response shape is documented and stable.

State token: Slack's `state` query param round-trips back on callback. We
sign it as `{agent_id}:{nonce}.{hmac}` with the app's encryption key so a
malicious referrer can't drop a foreign code into someone else's session.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from urllib.parse import urlencode
from uuid import UUID

import httpx

from config import settings
from integrations.slack.tokens import save_tokens

log = logging.getLogger("integrations.slack.oauth")

SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize"
SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access"


def _is_configured() -> bool:
    return bool(settings.slack_client_id and settings.slack_client_secret)


def _coerce_agent_uuid(agent_id: str | UUID) -> UUID | None:
    if not agent_id or agent_id == "demo":
        return None
    if isinstance(agent_id, UUID):
        return agent_id
    try:
        return UUID(str(agent_id))
    except (ValueError, AttributeError):
        return None


def _state_secret() -> bytes:
    """Use the existing Fernet key as HMAC secret. It's already required
    to exist in any environment that stores tokens, and it's a per-deploy
    secret — perfect for state signing."""
    key = settings.encryption_key or "dev-fallback-not-for-prod"
    return key.encode()


def _sign_state(agent_id: str, nonce: str) -> str:
    payload = f"{agent_id}:{nonce}"
    sig = hmac.new(_state_secret(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def _verify_state(state: str) -> str | None:
    """Returns the agent_id if the signature checks out, else None."""
    if not state or "." not in state:
        return None
    payload, sig = state.rsplit(".", 1)
    expected = hmac.new(_state_secret(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    if ":" not in payload:
        return None
    agent_id, _nonce = payload.split(":", 1)
    return agent_id


async def get_auth_url(agent_id: str) -> str:
    if not _is_configured():
        raise ValueError(
            "Slack OAuth not configured. Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET "
            "in your .env file."
        )

    uid = _coerce_agent_uuid(agent_id)
    if uid is None:
        raise ValueError(
            "Connect requires a signed-in agent. Demo sessions cannot store Slack tokens."
        )

    state = _sign_state(str(uid), secrets.token_urlsafe(16))
    params = {
        "client_id": settings.slack_client_id,
        "scope": settings.slack_scopes,
        "redirect_uri": settings.slack_redirect_uri,
        "state": state,
    }
    return f"{SLACK_AUTHORIZE_URL}?{urlencode(params)}"


async def handle_auth_callback(code: str, state: str) -> dict:
    """Exchange the code for tokens and persist them encrypted.

    The agent_id is recovered from the signed `state` value, NOT trusted
    from a separate query param — that's the whole point of state.
    """
    if not _is_configured():
        raise ValueError("Slack OAuth not configured.")

    agent_id_str = _verify_state(state)
    if not agent_id_str:
        raise ValueError("Invalid OAuth state — refusing to bind tokens.")

    uid = _coerce_agent_uuid(agent_id_str)
    if uid is None:
        raise ValueError("State carried an unusable agent id.")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            SLACK_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.slack_client_id,
                "client_secret": settings.slack_client_secret,
                "redirect_uri": settings.slack_redirect_uri,
            },
        )
    resp.raise_for_status()
    body = resp.json()

    if not body.get("ok"):
        raise ValueError(f"Slack token exchange failed: {body.get('error', 'unknown')}")

    bot_access_token = body.get("access_token")
    if not bot_access_token:
        raise ValueError("Slack token exchange returned no bot access_token.")

    team = body.get("team") or {}
    authed_user = body.get("authed_user") or {}

    try:
        await save_tokens(
            uid,
            bot_access_token=bot_access_token,
            user_access_token=authed_user.get("access_token"),
            bot_user_id=body.get("bot_user_id"),
            authed_user_id=authed_user.get("id"),
            team_id=team.get("id") or "",
            team_name=team.get("name"),
            scope=body.get("scope"),
        )
    except LookupError as exc:
        raise ValueError(str(exc))

    log.info("Slack OAuth tokens stored for agent %s (team %s)", uid, team.get("id"))

    # Auto-join all public channels so the bot can read history
    # immediately — the user shouldn't have to /invite @Ravenhill
    # in every channel manually.
    try:
        from integrations.slack.adapter import join_all_public_channels
        joined = await join_all_public_channels(str(uid))
        log.info("Auto-joined %d public Slack channels for agent %s", joined, uid)
    except Exception:
        log.exception("Auto-join channels failed (non-fatal)")

    return {
        "status": "connected",
        "agent_id": str(uid),
        "team_id": team.get("id"),
        "team_name": team.get("name"),
    }
