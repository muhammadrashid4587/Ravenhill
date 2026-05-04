"""Google OAuth token persistence — encrypted at rest, tenant-isolated.

These tests exercise `integrations.google_tokens` directly so we can verify
the DB layer without running a real OAuth dance. The HTTP endpoints just
wrap these same calls.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

import db
from db import AgentRow, GoogleOAuthTokenRow, OrganizationRow
from integrations.google_tokens import (
    delete_tokens,
    is_connected,
    load_tokens,
    save_tokens,
)
from security.encryption import is_encrypted


async def _mkorg(name: str, slug: str) -> uuid.UUID:
    org_id = uuid.uuid4()
    async with db.async_session() as session:
        session.add(OrganizationRow(id=org_id, name=name, slug=slug))
        await session.commit()
    return org_id


async def _mkagent(org_id: uuid.UUID, email: str) -> uuid.UUID:
    agent_id = uuid.uuid4()
    async with db.async_session() as session:
        session.add(
            AgentRow(
                id=agent_id,
                org_id=org_id,
                name=email.split("@")[0].title(),
                email=email,
                role="Employee",
                departments=["General"],
                knowledge_areas=[],
                scopes=[],
                is_active=True,
            )
        )
        await session.commit()
    return agent_id


def _sample_bundle() -> dict:
    return {
        "access_token": "ya29.some-real-looking-access-token",
        "refresh_token": "1//0ewhatever-refresh-token",
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": "client-id.apps.googleusercontent.com",
        "client_secret": "GOCSPX-secret",
        "scopes": ["https://www.googleapis.com/auth/gmail.readonly"],
        "expiry": datetime.now(timezone.utc) + timedelta(hours=1),
    }


@pytest.mark.asyncio
async def test_save_and_load_round_trip():
    """Saving tokens then loading them yields the exact same values."""
    org_id = await _mkorg("Alpha Inc", "alpha")
    agent_id = await _mkagent(org_id, "alice@alpha.example.com")

    bundle = _sample_bundle()
    await save_tokens(agent_id, **bundle)

    loaded = await load_tokens(agent_id)
    assert loaded is not None
    assert loaded.access_token == bundle["access_token"]
    assert loaded.refresh_token == bundle["refresh_token"]
    assert loaded.token_uri == bundle["token_uri"]
    assert loaded.client_id == bundle["client_id"]
    assert loaded.client_secret == bundle["client_secret"]
    assert loaded.scopes == bundle["scopes"]


@pytest.mark.asyncio
async def test_tokens_encrypted_at_rest():
    """The stored ciphertext must not contain the plaintext tokens.

    If this test ever passes trivially (empty strings / stubs), the
    encryption boundary has silently broken. is_encrypted() checks for
    the Fernet 'gAAAAA' header.
    """
    org_id = await _mkorg("Beta LLC", "beta")
    agent_id = await _mkagent(org_id, "carl@beta.example.com")

    bundle = _sample_bundle()
    await save_tokens(agent_id, **bundle)

    async with db.async_session() as session:
        row = (
            await session.execute(
                select(GoogleOAuthTokenRow).where(
                    GoogleOAuthTokenRow.agent_id == agent_id
                )
            )
        ).scalar_one()

    assert is_encrypted(row.access_token), "access_token must be Fernet-encrypted"
    assert is_encrypted(row.refresh_token), "refresh_token must be Fernet-encrypted"
    assert is_encrypted(row.client_secret), "client_secret must be Fernet-encrypted"
    assert bundle["access_token"] not in row.access_token
    assert bundle["refresh_token"] not in row.refresh_token
    assert bundle["client_secret"] not in row.client_secret


@pytest.mark.asyncio
async def test_save_records_correct_org_id():
    """save_tokens must stamp org_id from the AgentRow, not trust the caller."""
    org_id = await _mkorg("Gamma Co", "gamma")
    agent_id = await _mkagent(org_id, "dan@gamma.example.com")

    await save_tokens(agent_id, **_sample_bundle())

    async with db.async_session() as session:
        row = (
            await session.execute(
                select(GoogleOAuthTokenRow).where(
                    GoogleOAuthTokenRow.agent_id == agent_id
                )
            )
        ).scalar_one()
    assert row.org_id == org_id


@pytest.mark.asyncio
async def test_save_rejects_unknown_agent():
    """Storing tokens against a nonexistent agent would leave an orphan row.

    Raise LookupError up front instead of creating a dangling row that
    bypasses tenant scoping.
    """
    ghost = uuid.uuid4()
    with pytest.raises(LookupError):
        await save_tokens(ghost, **_sample_bundle())


@pytest.mark.asyncio
async def test_cross_tenant_isolation():
    """Agent A's tokens must not leak to Agent B in another org."""
    org_a = await _mkorg("Org A", "org-a")
    org_b = await _mkorg("Org B", "org-b")
    alice = await _mkagent(org_a, "alice@org-a.example.com")
    bob = await _mkagent(org_b, "bob@org-b.example.com")

    alice_bundle = _sample_bundle()
    alice_bundle["access_token"] = "alice-secret-token"
    await save_tokens(alice, **alice_bundle)

    loaded_for_bob = await load_tokens(bob)
    assert loaded_for_bob is None, "Bob has no tokens; must not see Alice's"

    assert await is_connected(alice) is True
    assert await is_connected(bob) is False


@pytest.mark.asyncio
async def test_resave_preserves_refresh_token_when_omitted():
    """Google only issues a refresh_token on first consent. Later refreshes
    return access_token alone, so re-saving with refresh_token=None must
    NOT wipe the existing long-lived refresh_token."""
    org_id = await _mkorg("Delta", "delta")
    agent_id = await _mkagent(org_id, "eve@delta.example.com")

    first = _sample_bundle()
    first["refresh_token"] = "original-refresh-token"
    await save_tokens(agent_id, **first)

    refreshed = _sample_bundle()
    refreshed["access_token"] = "rotated-access-token"
    refreshed["refresh_token"] = None
    await save_tokens(agent_id, **refreshed)

    loaded = await load_tokens(agent_id)
    assert loaded.access_token == "rotated-access-token"
    assert loaded.refresh_token == "original-refresh-token"


@pytest.mark.asyncio
async def test_delete_tokens_is_idempotent():
    org_id = await _mkorg("Epsilon", "epsilon")
    agent_id = await _mkagent(org_id, "frank@epsilon.example.com")

    await save_tokens(agent_id, **_sample_bundle())
    assert await delete_tokens(agent_id) is True
    assert await delete_tokens(agent_id) is False
    assert await load_tokens(agent_id) is None


@pytest.mark.asyncio
async def test_tokens_survive_session_boundary():
    """Loading in a new async session must return the same bundle.

    This is the "persistence across restarts" guarantee in miniature —
    if the row weren't in a committed transaction, a fresh session
    wouldn't see it.
    """
    org_id = await _mkorg("Zeta", "zeta")
    agent_id = await _mkagent(org_id, "grace@zeta.example.com")

    bundle = _sample_bundle()
    await save_tokens(agent_id, **bundle)

    # Simulate a "restart" by forcing a fully new session.
    async with db.async_session() as _fresh:
        _ = await _fresh.get(AgentRow, agent_id)  # warm pool / distinct session

    loaded = await load_tokens(agent_id)
    assert loaded is not None
    assert loaded.access_token == bundle["access_token"]
