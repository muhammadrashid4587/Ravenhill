"""Encrypted Postgres storage for per-agent Slack OAuth tokens.

Mirrors the Google variant in `integrations/google_tokens.py`. Bot and
user tokens are Fernet-encrypted; team metadata is stored in clear so
the UI can show "Connected to Acme" without paying decryption cost.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select

import db
from db import AgentRow, SlackOAuthTokenRow
from security.encryption import decrypt, encrypt

log = logging.getLogger("integrations.slack.tokens")


@dataclass
class SlackTokenBundle:
    bot_access_token: str
    user_access_token: str | None
    bot_user_id: str | None
    authed_user_id: str | None
    team_id: str
    team_name: str | None
    scope: str | None


async def _resolve_agent_org(session, agent_id: UUID) -> UUID | None:
    agent = await session.get(AgentRow, agent_id)
    if agent is None:
        return None
    return agent.org_id


async def load_tokens(agent_id: UUID) -> SlackTokenBundle | None:
    async with db.async_session() as session:
        row = (
            await session.execute(
                select(SlackOAuthTokenRow).where(
                    SlackOAuthTokenRow.agent_id == agent_id
                )
            )
        ).scalar_one_or_none()
        if row is None:
            return None
        return SlackTokenBundle(
            bot_access_token=decrypt(row.bot_access_token),
            user_access_token=decrypt(row.user_access_token) if row.user_access_token else None,
            bot_user_id=row.bot_user_id,
            authed_user_id=row.authed_user_id,
            team_id=row.team_id,
            team_name=row.team_name,
            scope=row.scope,
        )


async def save_tokens(
    agent_id: UUID,
    *,
    bot_access_token: str,
    user_access_token: str | None,
    bot_user_id: str | None,
    authed_user_id: str | None,
    team_id: str,
    team_name: str | None,
    scope: str | None,
) -> None:
    from sqlalchemy import func

    async with db.async_session() as session:
        org_id = await _resolve_agent_org(session, agent_id)
        if org_id is None:
            raise LookupError(f"agent {agent_id} not found or has no org")

        existing = (
            await session.execute(
                select(SlackOAuthTokenRow).where(
                    SlackOAuthTokenRow.agent_id == agent_id
                )
            )
        ).scalar_one_or_none()

        encrypted_bot = encrypt(bot_access_token)
        encrypted_user = encrypt(user_access_token) if user_access_token else None

        if existing:
            existing.org_id = org_id
            existing.bot_access_token = encrypted_bot
            existing.user_access_token = encrypted_user
            existing.bot_user_id = bot_user_id
            existing.authed_user_id = authed_user_id
            existing.team_id = team_id
            existing.team_name = team_name
            existing.scope = scope
            existing.updated_at = func.now()
        else:
            session.add(
                SlackOAuthTokenRow(
                    org_id=org_id,
                    agent_id=agent_id,
                    bot_access_token=encrypted_bot,
                    user_access_token=encrypted_user,
                    bot_user_id=bot_user_id,
                    authed_user_id=authed_user_id,
                    team_id=team_id,
                    team_name=team_name,
                    scope=scope,
                )
            )
        await session.commit()


async def delete_tokens(agent_id: UUID) -> bool:
    async with db.async_session() as session:
        row = (
            await session.execute(
                select(SlackOAuthTokenRow).where(
                    SlackOAuthTokenRow.agent_id == agent_id
                )
            )
        ).scalar_one_or_none()
        if row is None:
            return False
        await session.delete(row)
        await session.commit()
        return True


async def is_connected(agent_id: UUID) -> bool:
    async with db.async_session() as session:
        row_id = (
            await session.execute(
                select(SlackOAuthTokenRow.id).where(
                    SlackOAuthTokenRow.agent_id == agent_id
                )
            )
        ).scalar_one_or_none()
        return row_id is not None


async def get_team_metadata(agent_id: UUID) -> dict | None:
    """Cheap read for status UI — returns just team_id / team_name / scope."""
    async with db.async_session() as session:
        row = (
            await session.execute(
                select(
                    SlackOAuthTokenRow.team_id,
                    SlackOAuthTokenRow.team_name,
                    SlackOAuthTokenRow.scope,
                    SlackOAuthTokenRow.authed_user_id,
                ).where(SlackOAuthTokenRow.agent_id == agent_id)
            )
        ).first()
        if row is None:
            return None
        return {
            "team_id": row.team_id,
            "team_name": row.team_name,
            "scope": row.scope,
            "authed_user_id": row.authed_user_id,
        }
