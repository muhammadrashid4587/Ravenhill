"""Encrypted Postgres storage for per-agent Google OAuth tokens.

The rest of the Google integration (`google_meet.py`, `workspace/adapters.py`)
calls into this module for every read/write — never touches the DB rows
directly. That keeps the encrypt/decrypt boundary auditable: if you grep
`GoogleOAuthTokenRow` the only legitimate callers are here.

Row identity is `(org_id, agent_id)` so two agents in different orgs can
connect independently and neither can ever see the other's tokens. The
`org_id` on the row is copied from `AgentRow.org_id` at save time — callers
pass only the `agent_id` and we look up the org ourselves, so there's no
way for a malformed caller to plant tokens under the wrong tenant.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import select

import db
from db import AgentRow, GoogleOAuthTokenRow
from security.encryption import decrypt, encrypt

log = logging.getLogger("integrations.google_tokens")


@dataclass
class GoogleTokenBundle:
    """Decrypted token bundle ready to hydrate a `google.oauth2` Credentials.

    Mirrors the fields that googleapiclient needs — nothing extra — so the
    adapter can build a Credentials object with one call.
    """

    access_token: str
    refresh_token: str | None
    token_uri: str
    client_id: str
    client_secret: str
    scopes: list[str]
    expiry: datetime | None


async def _resolve_agent_org(session, agent_id: UUID) -> UUID | None:
    """Return the agent's org_id, or None if the agent doesn't exist."""
    agent = await session.get(AgentRow, agent_id)
    if agent is None:
        return None
    return agent.org_id


async def load_tokens(agent_id: UUID) -> GoogleTokenBundle | None:
    """Return the decrypted token bundle for this agent, or None if unlinked.

    No org filter on the query itself — the row's org_id is a property of
    the agent, not the caller. Callers that need tenant isolation pass the
    authenticated agent's own id (which is scoped by definition).
    """
    async with db.async_session() as session:
        row = (
            await session.execute(
                select(GoogleOAuthTokenRow).where(
                    GoogleOAuthTokenRow.agent_id == agent_id
                )
            )
        ).scalar_one_or_none()
        if row is None:
            return None
        return GoogleTokenBundle(
            access_token=decrypt(row.access_token),
            refresh_token=decrypt(row.refresh_token) if row.refresh_token else None,
            token_uri=row.token_uri,
            client_id=row.client_id,
            client_secret=decrypt(row.client_secret),
            scopes=list(row.scopes or []),
            expiry=row.expiry,
        )


async def save_tokens(
    agent_id: UUID,
    *,
    access_token: str,
    refresh_token: str | None,
    token_uri: str,
    client_id: str,
    client_secret: str,
    scopes: list[str],
    expiry: datetime | None = None,
) -> None:
    """Upsert the encrypted token bundle for `agent_id`.

    Raises `LookupError` if the agent doesn't exist or has no org — we
    never want to persist tokens against a dangling or untenanted agent.
    On an update, the existing `refresh_token` is preserved when the caller
    passes None, since Google only re-issues the refresh token on the very
    first consent (subsequent refreshes return `access_token` only).
    """
    from sqlalchemy import func

    async with db.async_session() as session:
        org_id = await _resolve_agent_org(session, agent_id)
        if org_id is None:
            raise LookupError(f"agent {agent_id} not found or has no org")

        existing = (
            await session.execute(
                select(GoogleOAuthTokenRow).where(
                    GoogleOAuthTokenRow.agent_id == agent_id
                )
            )
        ).scalar_one_or_none()

        encrypted_access = encrypt(access_token)
        encrypted_client_secret = encrypt(client_secret)
        encrypted_refresh = encrypt(refresh_token) if refresh_token else None

        if existing:
            existing.org_id = org_id
            existing.access_token = encrypted_access
            if encrypted_refresh is not None:
                existing.refresh_token = encrypted_refresh
            existing.token_uri = token_uri
            existing.client_id = client_id
            existing.client_secret = encrypted_client_secret
            existing.scopes = list(scopes)
            existing.expiry = expiry
            existing.updated_at = func.now()
        else:
            session.add(
                GoogleOAuthTokenRow(
                    org_id=org_id,
                    agent_id=agent_id,
                    access_token=encrypted_access,
                    refresh_token=encrypted_refresh,
                    token_uri=token_uri,
                    client_id=client_id,
                    client_secret=encrypted_client_secret,
                    scopes=list(scopes),
                    expiry=expiry,
                )
            )
        await session.commit()


async def delete_tokens(agent_id: UUID) -> bool:
    """Drop the agent's token row. Returns True if a row was deleted."""
    async with db.async_session() as session:
        row = (
            await session.execute(
                select(GoogleOAuthTokenRow).where(
                    GoogleOAuthTokenRow.agent_id == agent_id
                )
            )
        ).scalar_one_or_none()
        if row is None:
            return False
        await session.delete(row)
        await session.commit()
        return True


async def is_connected(agent_id: UUID) -> bool:
    """Cheap existence check — avoids paying for decryption just to ask."""
    async with db.async_session() as session:
        row_id = (
            await session.execute(
                select(GoogleOAuthTokenRow.id).where(
                    GoogleOAuthTokenRow.agent_id == agent_id
                )
            )
        ).scalar_one_or_none()
        return row_id is not None
