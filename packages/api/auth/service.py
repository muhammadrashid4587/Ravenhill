"""Auth business logic — invites, sessions, access requests.

Every function here takes a session-factory override for testability. In
production callers pass `db.async_session`; in tests the conftest swaps it
for an in-memory SQLite factory.
"""

import re
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
    OrganizationRow,
)
from .password import hash_password, verify_password


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


def _display_name_from_email(email: str) -> str:
    """Derive a human-ish name from the local-part so a new signup has
    something to show until they edit their profile."""
    local = email.split("@", 1)[0]
    parts = (
        local.replace(".", " ").replace("_", " ").replace("-", " ").split()
    )
    if not parts:
        return local
    return " ".join(p.capitalize() for p in parts)


def _generate_token(nbytes: int = 32) -> str:
    """URL-safe random token. 32 bytes ≈ 43 chars, 256-bit entropy."""
    return secrets.token_urlsafe(nbytes)


def _slugify(text: str) -> str:
    """Conservative slug — lowercased, non-alnum collapsed to single hyphen,
    trimmed. Never returns empty; falls back to 'workspace'."""
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:60] or "workspace"


async def _create_org_for_new_user(
    session, display_name: str
) -> OrganizationRow:
    """Mint a brand-new Organization for a self-serve signup.

    The slug is derived from the display name with a hex suffix appended on
    collision (retries a handful of times, then appends unconditionally).
    Leaves `invite_code=None` so the new org can't be joined via share-link
    until the admin explicitly enables one later.
    """
    base_slug = _slugify((display_name or "") + "-workspace")
    slug = base_slug
    for _ in range(8):
        existing = await session.execute(
            select(OrganizationRow).where(OrganizationRow.slug == slug)
        )
        if existing.scalar_one_or_none() is None:
            break
        slug = f"{base_slug}-{secrets.token_hex(3)}"

    org = OrganizationRow(
        name=f"{display_name}'s Workspace" if display_name else "New Workspace",
        slug=slug,
        invite_code=None,
        invite_approval_required=False,
    )
    session.add(org)
    await session.flush()
    return org


async def _ensure_agent_has_org(session, agent: AgentRow) -> None:
    """Guarantee agent.org_id is set before a session is issued.

    Invite-accept paths set `agent.org_id` directly before calling into
    session creation, so this is a no-op there. Self-serve paths (password
    signup, magic-link first-sign-in with no invite) land here with a
    NULL org_id and get a fresh workspace minted — with org_role=admin,
    because the first user in an org owns it.
    """
    if agent.org_id is not None:
        return
    org = await _create_org_for_new_user(session, agent.name or "")
    agent.org_id = org.id
    agent.org_role = "admin"


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
    org_id: UUID | None = None,
) -> tuple[AuthInviteRow, str]:
    """Create a single-use invite. Returns (row, invite_url).

    The invite_url points at the frontend verify route, carrying the token
    in the query string. The admin (human) then emails this URL to the
    invited user out-of-band.

    `org_id` is stamped on the invite so `consume_invite` knows which org
    to join the user to. The legacy global admin-token path leaves this
    NULL — callers that should land in a specific org must pass it.
    """
    token = _generate_token()
    expires_at = _now() + timedelta(days=settings.invite_ttl_days)
    email_norm = _normalize_email(email)

    async with db.async_session() as session:
        row = AuthInviteRow(
            token=token,
            org_id=org_id,
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
    """Self-serve sign-in. Auto-creates an Agent on first sign-in, throttles
    repeat requests, and returns a short-lived login-only invite.

    Raises SignInError('account_deactivated') if the email matches a
    disabled Agent (admin-managed). Raises SignInError('too_frequent') if
    a link was issued recently — the caller tells the user to check email.
    """
    email_norm = _normalize_email(email)
    now = _now()

    async with db.async_session() as session:
        result = await session.execute(
            select(AgentRow).where(AgentRow.email == email_norm)
        )
        agent = result.scalar_one_or_none()

        if agent is None:
            # Self-serve signup: create an agent with sensible placeholders.
            # The user refines their profile after first sign-in.
            agent = AgentRow(
                email=email_norm,
                name=_display_name_from_email(email_norm),
                role="Member",
                departments=["General"],
                is_active=True,
            )
            session.add(agent)
            await session.flush()
            # First-time sign-in creates their workspace.
            await _ensure_agent_has_org(session, agent)
        elif not agent.is_active:
            raise SignInError("account_deactivated")
        else:
            # Pre-existing agents may predate multi-tenancy — make sure they
            # always have an org before we throttle/issue a token.
            await _ensure_agent_has_org(session, agent)

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


async def find_org_by_invite_code(invite_code: str) -> OrganizationRow | None:
    """Resolve a share-link invite_code to its Org, enforcing expiry.

    Returns None for unknown or expired codes — callers should treat both
    identically to avoid leaking whether a given code ever existed.
    """
    code = (invite_code or "").strip()
    if not code:
        return None
    now = _now()
    async with db.async_session() as session:
        result = await session.execute(
            select(OrganizationRow).where(OrganizationRow.invite_code == code)
        )
        org = result.scalar_one_or_none()
        if org is None:
            return None
        if org.invite_code_expires_at is not None and (
            _as_utc_naive(org.invite_code_expires_at) < _as_utc_naive(now)
        ):
            return None
        return org


async def signup_via_share_link(
    invite_code: str, email: str, password: str, name: str | None
) -> tuple[AgentRow, AuthSessionRow]:
    """Create an account directly inside the org identified by `invite_code`.

    This is the GitHub-style share-link path: anyone with the link signs
    up and lands as a `member` of that org, bypassing the default
    self-serve workflow that would have minted them a fresh workspace.

    Raises SignInError('invite_invalid') for unknown/expired codes and
    'email_taken' for duplicate-with-password accounts, so the frontend
    can distinguish the two failure modes.
    """
    org = await find_org_by_invite_code(invite_code)
    if org is None:
        raise SignInError("invite_invalid")

    email_norm = _normalize_email(email)
    now = _now()

    async with db.async_session() as session:
        result = await session.execute(
            select(AgentRow).where(AgentRow.email == email_norm)
        )
        agent = result.scalar_one_or_none()

        if agent is not None:
            # Existing account with a password already set can't re-join
            # via share-link — they should just log in. Password-less
            # accounts (magic-link-only) *can* upgrade: we attach the
            # password and move them into the share-link's org.
            if agent.password_hash:
                raise SignInError("email_taken")
            if not agent.is_active:
                raise SignInError("account_deactivated")
            agent.password_hash = hash_password(password)
            if name and not agent.name:
                agent.name = name
        else:
            display = (name or "").strip() or _display_name_from_email(email_norm)
            agent = AgentRow(
                email=email_norm,
                name=display,
                role="Member",
                departments=["General"],
                is_active=True,
                password_hash=hash_password(password),
            )
            session.add(agent)
            await session.flush()

        # Place the agent in the share-link's org as a plain member.
        # Share-link signups never become admins — admin is reserved for
        # the user who originally created the org.
        agent.org_id = org.id
        if agent.org_role != "admin":
            agent.org_role = "member"

        session_row = AuthSessionRow(
            session_token=_generate_token(),
            agent_id=agent.id,
            org_id=agent.org_id,
            email=email_norm,
            expires_at=now + timedelta(days=settings.session_ttl_days),
        )
        session.add(session_row)
        await session.commit()
        await session.refresh(agent)
        await session.refresh(session_row)
        return agent, session_row


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

        # Resolve the agent's org. Invite-carried org wins (user joined a
        # real org via email invite or share-link); otherwise self-serve
        # creates a fresh workspace.
        if invite.org_id is not None:
            agent.org_id = invite.org_id
            # Invited users are members by default; admins of the target
            # org are only minted via the signup-creates-org path.
            if agent.org_role != "admin":
                agent.org_role = "member"
        else:
            await _ensure_agent_has_org(session, agent)

        # Create the session, snapshotting the agent's org at this instant
        # so request-scope queries don't need a JOIN to know the tenant.
        session_row = AuthSessionRow(
            session_token=_generate_token(),
            agent_id=agent.id,
            org_id=agent.org_id,
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


# ---------- Password auth (signup + login) ----------


async def signup_with_password(
    email: str, password: str, name: str | None
) -> tuple[AgentRow, AuthSessionRow]:
    """Create an Agent with a password hash and issue a session.

    Raises SignInError('email_taken') if the email already has an account
    with a password set. If an Agent exists without a password_hash (e.g.
    was created via magic-link earlier), we attach the password to it —
    this lets the same email flow seamlessly from the old UX to the new.
    """
    email_norm = _normalize_email(email)
    now = _now()

    async with db.async_session() as session:
        result = await session.execute(
            select(AgentRow).where(AgentRow.email == email_norm)
        )
        agent = result.scalar_one_or_none()

        if agent is not None:
            if agent.password_hash:
                raise SignInError("email_taken")
            if not agent.is_active:
                raise SignInError("account_deactivated")
            agent.password_hash = hash_password(password)
            if name and not agent.name:
                agent.name = name
        else:
            display = (name or "").strip() or _display_name_from_email(email_norm)
            agent = AgentRow(
                email=email_norm,
                name=display,
                role="Member",
                departments=["General"],
                is_active=True,
                password_hash=hash_password(password),
            )
            session.add(agent)
            await session.flush()

        # Signup always ensures the agent owns an org. First-time signups
        # become admins of a fresh workspace; returning email-only agents
        # upgrading to password auth keep their existing org.
        await _ensure_agent_has_org(session, agent)

        session_row = AuthSessionRow(
            session_token=_generate_token(),
            agent_id=agent.id,
            org_id=agent.org_id,
            email=email_norm,
            expires_at=now + timedelta(days=settings.session_ttl_days),
        )
        session.add(session_row)
        await session.commit()
        await session.refresh(agent)
        await session.refresh(session_row)
        return agent, session_row


async def login_with_password(
    email: str, password: str
) -> tuple[AgentRow, AuthSessionRow]:
    """Verify a password and issue a session.

    Raises SignInError('invalid_credentials') on any failure (missing
    agent, wrong password, no password set) — deliberately opaque so we
    don't leak which emails are registered. Raises 'account_deactivated'
    on a disabled-admin'd account.
    """
    email_norm = _normalize_email(email)
    now = _now()

    async with db.async_session() as session:
        result = await session.execute(
            select(AgentRow).where(AgentRow.email == email_norm)
        )
        agent = result.scalar_one_or_none()

        if agent is None or not agent.password_hash:
            raise SignInError("invalid_credentials")
        if not agent.is_active:
            raise SignInError("account_deactivated")
        if not verify_password(password, agent.password_hash):
            raise SignInError("invalid_credentials")

        # Defensive: ensure any pre-org account has one attached before we
        # issue a session. A no-op for normal users; keeps the invariant
        # ("every authenticated user has an org") true across all paths.
        await _ensure_agent_has_org(session, agent)

        session_row = AuthSessionRow(
            session_token=_generate_token(),
            agent_id=agent.id,
            org_id=agent.org_id,
            email=email_norm,
            expires_at=now + timedelta(days=settings.session_ttl_days),
        )
        session.add(session_row)
        await session.commit()
        await session.refresh(agent)
        await session.refresh(session_row)
        return agent, session_row


# ---------- Dev-only convenience: sign in as a seed agent ----------


async def create_dev_session_for_agent(agent_id: UUID) -> AuthSessionRow | None:
    """Issue a session bound to an existing agent. Only enabled in dev via
    a guarded router path — here we just take the id at face value."""
    async with db.async_session() as session:
        agent = await session.get(AgentRow, agent_id)
        if agent is None:
            return None
        # Dev logins shouldn't mint new orgs for seed agents (they already
        # live in the default org). But on a fresh DB where alter/backfill
        # hasn't landed yet, org_id could still be NULL — guard it.
        await _ensure_agent_has_org(session, agent)
        row = AuthSessionRow(
            session_token=_generate_token(),
            agent_id=agent.id,
            org_id=agent.org_id,
            email=(agent.email or ""),
            expires_at=_now() + timedelta(days=settings.session_ttl_days),
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row
