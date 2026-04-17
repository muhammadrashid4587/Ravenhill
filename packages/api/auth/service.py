"""Auth business logic — invites, sessions, access requests.

Every function here takes a session-factory override for testability. In
production callers pass `db.async_session`; in tests the conftest swaps it
for an in-memory SQLite factory.
"""

import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import and_, delete, select

import db
from config import settings
from db import (
    AccessRequestRow,
    AgentRow,
    AuthInviteRow,
    AuthSessionRow,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc_naive(dt: datetime) -> datetime:
    """Normalize datetimes for comparison. Postgres stores TZ-aware values;
    SQLite drops the tz and returns naive datetimes. Strip tz on both sides
    so we compare apples to apples."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _generate_token(nbytes: int = 32) -> str:
    """URL-safe random token. 32 bytes ≈ 43 chars, 256-bit entropy."""
    return secrets.token_urlsafe(nbytes)


# ---------- Access requests (public waitlist) ----------


async def record_access_request(
    email: str,
    name: str | None,
    company: str | None,
    role: str | None,
    use_case: str | None,
) -> None:
    """Store a waitlist submission. Never errors on duplicate email —
    the admin reviews all entries manually."""
    async with db.async_session() as session:
        row = AccessRequestRow(
            email=_normalize_email(email),
            name=(name or None),
            company=(company or None),
            role=(role or None),
            use_case=(use_case or None),
        )
        session.add(row)
        await session.commit()


# ---------- Invites ----------


async def create_invite(
    email: str,
    name: str,
    role: str,
    department: str,
) -> tuple[AuthInviteRow, str]:
    """Create a single-use invite. Returns (row, invite_url).

    The invite_url points at the frontend verify route, carrying the token
    in the query string. The admin (human) then emails this URL to the
    invited user out-of-band.
    """
    token = _generate_token()
    expires_at = _now() + timedelta(days=settings.invite_ttl_days)
    email_norm = _normalize_email(email)

    async with db.async_session() as session:
        row = AuthInviteRow(
            token=token,
            email=email_norm,
            name=name,
            role=role,
            department=department,
            expires_at=expires_at,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)

    site_url = settings.site_url.rstrip("/")
    invite_url = f"{site_url}/login/verify?token={token}"
    return row, invite_url


class SignInError(Exception):
    """Raised by create_signin_token for a named failure state. `code`
    is the machine-readable reason the router translates to user-facing
    copy."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


async def create_signin_token(email: str) -> tuple[AgentRow, AuthInviteRow, str]:
    """Self-serve sign-in. Validates the email is admitted, throttles,
    and returns a short-lived login-only invite.

    Raises SignInError('email_not_admitted') if no Agent exists for this
    email. Raises SignInError('too_frequent') if a link was issued
    recently — the caller should tell the user to check their email.
    """
    email_norm = _normalize_email(email)
    now = _now()

    async with db.async_session() as session:
        result = await session.execute(
            select(AgentRow).where(AgentRow.email == email_norm)
        )
        agent = result.scalar_one_or_none()
        if agent is None or not agent.is_active:
            raise SignInError("email_not_admitted")

        # Throttle: refuse if a login-only invite for this email was
        # created in the last `signin_throttle_seconds`.
        throttle_cutoff = now - timedelta(seconds=settings.signin_throttle_seconds)
        recent = await session.execute(
            select(AuthInviteRow).where(
                and_(
                    AuthInviteRow.email == email_norm,
                    AuthInviteRow.is_login_only.is_(True),
                    AuthInviteRow.created_at > throttle_cutoff,
                )
            )
        )
        if recent.scalars().first() is not None:
            raise SignInError("too_frequent")

        token = _generate_token()
        row = AuthInviteRow(
            token=token,
            email=email_norm,
            name=agent.name,
            role=agent.role,
            department=(agent.departments or ["General"])[0],
            is_login_only=True,
            expires_at=now + timedelta(minutes=settings.signin_ttl_minutes),
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        await session.refresh(agent)

    site_url = settings.site_url.rstrip("/")
    invite_url = f"{site_url}/login/verify?token={token}"
    return agent, row, invite_url


async def consume_invite(token: str) -> tuple[AgentRow, AuthSessionRow]:
    """Mark an invite as used, create-or-update the Agent, create a session.

    Raises ValueError with a short reason on any failure; the router maps
    that to a 401.
    """
    now = _now()

    async with db.async_session() as session:
        invite = await session.get(AuthInviteRow, token)
        if invite is None:
            raise ValueError("invite_not_found")
        if invite.used_at is not None:
            raise ValueError("invite_already_used")
        if _as_utc_naive(invite.expires_at) < _as_utc_naive(now):
            raise ValueError("invite_expired")

        email = _normalize_email(invite.email)

        # Find or create the Agent for this email.
        existing = await session.execute(
            select(AgentRow).where(AgentRow.email == email)
        )
        agent = existing.scalar_one_or_none()
        if agent is None:
            agent = AgentRow(
                name=invite.name,
                email=email,
                role=invite.role,
                departments=[invite.department],
                scopes=["read:public"],
                is_active=True,
            )
            session.add(agent)
            await session.flush()  # assign id
        elif not invite.is_login_only:
            # Admin-issued invite — the admin is authoritative about
            # name/role/department at invite time.
            agent.name = invite.name
            agent.role = invite.role
            if invite.department and invite.department not in (agent.departments or []):
                agent.departments = [invite.department]
        # Self-serve login tokens (is_login_only=True) never mutate the
        # Agent profile — the user might have edited their own fields
        # between login events.

        # Create the session.
        session_row = AuthSessionRow(
            session_token=_generate_token(),
            agent_id=agent.id,
            email=email,
            expires_at=now + timedelta(days=settings.session_ttl_days),
        )
        session.add(session_row)

        invite.used_at = now
        await session.commit()
        await session.refresh(agent)
        await session.refresh(session_row)

        return agent, session_row


# ---------- Sessions ----------


async def validate_session(session_token: str) -> tuple[AgentRow, AuthSessionRow] | None:
    """Return (agent, session) if the token is valid; None otherwise.

    Side effect: bumps `last_seen_at` on the session row."""
    now = _now()
    async with db.async_session() as session:
        row = await session.get(AuthSessionRow, session_token)
        if row is None:
            return None
        if _as_utc_naive(row.expires_at) < _as_utc_naive(now):
            # Lazy cleanup — delete and return None.
            await session.delete(row)
            await session.commit()
            return None

        agent = await session.get(AgentRow, row.agent_id)
        if agent is None or not agent.is_active:
            await session.delete(row)
            await session.commit()
            return None

        row.last_seen_at = now
        await session.commit()
        await session.refresh(agent)
        await session.refresh(row)
        return agent, row


async def delete_session(session_token: str) -> None:
    async with db.async_session() as session:
        await session.execute(
            delete(AuthSessionRow).where(AuthSessionRow.session_token == session_token)
        )
        await session.commit()


# ---------- Dev-only convenience: sign in as a seed agent ----------


async def create_dev_session_for_agent(agent_id: UUID) -> AuthSessionRow | None:
    """Issue a session bound to an existing agent. Only enabled in dev via
    a guarded router path — here we just take the id at face value."""
    async with db.async_session() as session:
        agent = await session.get(AgentRow, agent_id)
        if agent is None:
            return None
        row = AuthSessionRow(
            session_token=_generate_token(),
            agent_id=agent.id,
            email=(agent.email or ""),
            expires_at=_now() + timedelta(days=settings.session_ttl_days),
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row
