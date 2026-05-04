"""Auth HTTP routes."""

import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select

from config import settings
import db
from db import AgentRow, AuthSessionRow, OrganizationRow

from .deps import extract_session_token, get_current_agent_optional, require_admin_token
from .email import send_signin_email
from .models import (
    AccessRequestPayload,
    AccessRequestResponse,
    CurrentUserAgent,
    InvitePayload,
    InviteResponse,
    LoginPayload,
    MeResponse,
    ShareLinkSignupPayload,
    SignInRequestPayload,
    SignInRequestResponse,
    SignupPayload,
    VerifyPayload,
)
from .service import (
    SignInError,
    consume_invite,
    create_dev_session_for_agent,
    create_invite,
    create_signin_token,
    delete_session,
    login_with_password,
    record_access_request,
    signup_via_share_link,
    signup_with_password,
)

router = APIRouter()


def _set_session_cookie(response: Response, token: str) -> None:
    secure = settings.site_url.startswith("https://")
    # SameSite=None required for cross-site cookie (frontend on vercel.app,
    # API on fly.dev). Browsers only accept SameSite=None when Secure=True.
    samesite = "none" if secure else "lax"
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_days * 24 * 60 * 60,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    secure = settings.site_url.startswith("https://")
    samesite = "none" if secure else "lax"
    response.set_cookie(
        key=settings.session_cookie_name,
        value="",
        max_age=0,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )


def _agent_to_current_user(agent: AgentRow) -> CurrentUserAgent:
    return CurrentUserAgent(
        id=str(agent.id),
        name=agent.name,
        email=agent.email or "",
        role=agent.role,
        departments=list(agent.departments or []),
        scopes=list(agent.scopes or []),
    )


# ---------- Public: request access (waitlist) ----------


@router.post("/request-access", response_model=AccessRequestResponse)
async def request_access(payload: AccessRequestPayload) -> AccessRequestResponse:
    """Cold visitor submits a request. We store it and return a generic ack —
    we deliberately don't distinguish duplicates or allowlisted emails."""
    await record_access_request(
        email=payload.email,
        name=payload.name,
        company=payload.company,
        role=payload.role,
        use_case=payload.use_case,
    )
    return AccessRequestResponse(status="received")


# ---------- Admin: issue an invite ----------


@router.post(
    "/invite",
    response_model=InviteResponse,
    dependencies=[Depends(require_admin_token)],
)
async def issue_invite(payload: InvitePayload) -> InviteResponse:
    """Generate a single-use magic-link URL for the given email.

    Admin-only. Caller must send X-Admin-Token header matching ADMIN_TOKEN.
    The admin (human) is responsible for delivering the returned URL to the
    invited user (for now, via personal email)."""
    row, invite_url = await create_invite(
        email=payload.email,
        name=payload.name,
        role=payload.role,
        department=payload.department,
    )
    return InviteResponse(
        invite_url=invite_url,
        token=row.token,
        expires_at=row.expires_at,
    )


# ---------- Public: self-serve sign-in ----------


@router.post("/sign-in-request", response_model=SignInRequestResponse)
async def sign_in_request(payload: SignInRequestPayload) -> SignInRequestResponse:
    """Self-serve sign-in. If no Agent exists for this email we create one
    on the fly with sensible defaults; either way we email a fresh one-shot
    login link.

    403 with `account_deactivated` if the email matches an admin-disabled
    Agent. 429 with `too_frequent` if a link was issued in the last minute.
    """
    try:
        agent, _invite, invite_url = await create_signin_token(payload.email)
    except SignInError as e:
        if e.code == "account_deactivated":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="account_deactivated",
            )
        if e.code == "too_frequent":
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="too_frequent",
            )
        raise

    try:
        result = await send_signin_email(
            to=agent.email or payload.email,
            name=agent.name,
            invite_url=invite_url,
        )
    except RuntimeError:
        # Resend rejected the send. Treat as a 500 so the admin knows.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="email_send_failed",
        )

    # Only surface the URL in dev mode so the local user can test without
    # a configured email provider.
    dev_url = None
    if (not result.sent) and settings.app_env == "development":
        dev_url = result.dev_url

    return SignInRequestResponse(
        status="sent" if result.sent else "logged",
        dev_url=dev_url,
    )


# ---------- Public: password signup + login ----------


@router.post("/signup")
async def signup(payload: SignupPayload, response: Response) -> dict:
    """Create an account with email + password. Returns the current user
    and sets the session cookie. 409 if email is already registered.

    When `ALLOW_SELF_SERVE_SIGNUP` is False (production enterprise mode),
    returns 403 with `self_serve_disabled` so the frontend shows
    "Request Access" instead. Invite-link signup and admin-provisioned
    tenant claim are NOT affected by this gate — only standalone
    "create your own workspace" signup.
    """
    if not settings.allow_self_serve_signup:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="self_serve_disabled",
        )
    try:
        agent, session = await signup_with_password(
            payload.email, payload.password, payload.name
        )
    except SignInError as e:
        if e.code == "email_taken":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="email_taken")
        if e.code == "account_deactivated":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="account_deactivated"
            )
        raise

    _set_session_cookie(response, session.session_token)

    # Fire-and-forget verification email on signup.
    try:
        from .email import send_verification_email
        from .service import _normalize_email
        vtoken = secrets.token_urlsafe(32)
        site = settings.site_url.rstrip("/")
        verify_url = f"{site}/login/verify-email?token={vtoken}"
        email_norm = _normalize_email(payload.email)
        async with db.async_session() as s:
            a = await s.get(AgentRow, agent.id)
            if a:
                a.email_verification_token = vtoken
                await s.commit()
        await send_verification_email(email_norm, agent.name, verify_url)
    except Exception:
        pass  # verification email failure must never block signup

    return {
        "agent": _agent_to_current_user(agent).model_dump(),
        "expires_at": session.expires_at.isoformat(),
        "session_token": session.session_token,
    }


@router.post("/login")
async def login(payload: LoginPayload, response: Response) -> dict:
    """Verify email + password, set the session cookie, return the user.
    401 invalid_credentials on any failure; 403 account_deactivated if
    the account is disabled."""
    try:
        agent, session = await login_with_password(payload.email, payload.password)
    except SignInError as e:
        if e.code == "account_deactivated":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="account_deactivated"
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials"
        )

    _set_session_cookie(response, session.session_token)
    return {
        "agent": _agent_to_current_user(agent).model_dump(),
        "expires_at": session.expires_at.isoformat(),
        "session_token": session.session_token,
    }


# ---------- Public: signup via org share-link ----------


@router.post("/share-link-signup")
async def share_link_signup(
    payload: ShareLinkSignupPayload, response: Response
) -> dict:
    """Create an account that joins an org via its share-link invite_code.

    On success: agent lands as a `member` of that org and receives a
    session cookie. 404 `invite_invalid` for unknown/expired codes, 409
    `email_taken` if the email already has a password-backed account.
    """
    try:
        agent, session = await signup_via_share_link(
            payload.invite_code, payload.email, payload.password, payload.name
        )
    except SignInError as e:
        if e.code == "invite_invalid":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="invite_invalid"
            )
        if e.code == "email_taken":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="email_taken"
            )
        if e.code == "account_deactivated":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="account_deactivated"
            )
        raise

    _set_session_cookie(response, session.session_token)
    return {
        "agent": _agent_to_current_user(agent).model_dump(),
        "expires_at": session.expires_at.isoformat(),
        "session_token": session.session_token,
    }


# ---------- Public: claim a provisioned tenant (become admin) ----------


class ClaimTenantPayload(BaseModel):
    setup_token: str
    email: str
    password: str
    name: str = ""


@router.post("/claim-tenant")
async def claim_tenant(payload: ClaimTenantPayload, response: Response) -> dict:
    """Exchange a setup_token for an admin account on the provisioned
    workspace. Creates the AgentRow, sets org_role=admin, issues a
    session. The setup_token is consumed (NULLed) so it can't be reused.

    This is the production onboarding path for real customer admins.
    """
    from agents.seniority import derive_from_role
    from auth.service import hash_password, _normalize_email, _generate_token

    email_norm = _normalize_email(payload.email)
    now = datetime.now(timezone.utc)

    async with db.async_session() as session:
        # Find the org by setup_token
        result = await session.execute(
            select(OrganizationRow).where(
                OrganizationRow.setup_token == payload.setup_token
            )
        )
        org = result.scalar_one_or_none()
        if not org:
            raise HTTPException(status_code=404, detail="setup_token_invalid")
        if org.setup_token_expires_at and org.setup_token_expires_at < now:
            raise HTTPException(status_code=410, detail="setup_token_expired")

        # Check email isn't already taken
        existing = await session.execute(
            select(AgentRow).where(AgentRow.email == email_norm)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="email_taken"
            )

        # Create admin agent
        display = (payload.name or "").strip() or email_norm.split("@")[0]
        agent = AgentRow(
            email=email_norm,
            name=display,
            role="Admin",
            departments=["Executive"],
            is_active=True,
            password_hash=hash_password(payload.password),
            org_id=org.id,
            org_role="admin",
            seniority=derive_from_role("Admin"),
        )
        session.add(agent)
        await session.flush()

        # Consume the setup token so it can't be reused
        org.setup_token = None
        org.setup_token_expires_at = None
        org.updated_at = now

        # Issue a session
        session_row = AuthSessionRow(
            session_token=_generate_token(),
            agent_id=agent.id,
            org_id=org.id,
            email=email_norm,
            expires_at=now + timedelta(days=settings.session_ttl_days),
        )
        session.add(session_row)
        await session.commit()
        await session.refresh(agent)
        await session.refresh(session_row)

    _set_session_cookie(response, session_row.session_token)
    return {
        "agent": _agent_to_current_user(agent).model_dump(),
        "workspace_name": org.name,
        "expires_at": session_row.expires_at.isoformat(),
        "session_token": session_row.session_token,
    }


# ---------- Public: verify an invite, set session cookie ----------


@router.post("/verify")
async def verify_invite(payload: VerifyPayload, response: Response) -> dict:
    """Exchange a magic-link token for a session cookie.

    On success: sets the HttpOnly session cookie and returns the current
    user payload. On any failure: 401 with a short code — `invite_expired`,
    `invite_already_used`, `invite_not_found`."""
    try:
        agent, session = await consume_invite(payload.token)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )

    _set_session_cookie(response, session.session_token)
    return {
        "agent": _agent_to_current_user(agent).model_dump(),
        "expires_at": session.expires_at.isoformat(),
        # Returned so the frontend can mirror the token as a same-domain
        # cookie for its middleware presence-check. The API-domain cookie
        # (HttpOnly, SameSite=None) is still the real credential.
        "session_token": session.session_token,
    }


# ---------- Email verification ----------


class SendVerificationPayload(BaseModel):
    email: str


@router.post("/send-verification")
async def send_verification(payload: SendVerificationPayload) -> dict:
    """Send (or re-send) a verification email. Works for any registered
    email — we don't reveal whether the account exists."""
    from .email import send_verification_email
    from .service import _normalize_email

    email_norm = _normalize_email(payload.email)
    token = secrets.token_urlsafe(32)
    site = settings.site_url.rstrip("/")
    verify_url = f"{site}/login/verify-email?token={token}"

    async with db.async_session() as session:
        result = await session.execute(
            select(AgentRow).where(AgentRow.email == email_norm)
        )
        agent = result.scalar_one_or_none()
        if agent and not agent.email_verified:
            agent.email_verification_token = token
            await session.commit()
            await send_verification_email(email_norm, agent.name, verify_url)

    return {"status": "sent"}


class VerifyEmailPayload(BaseModel):
    token: str


@router.post("/verify-email")
async def verify_email(payload: VerifyEmailPayload) -> dict:
    """Exchange a verification token for email_verified=True."""
    async with db.async_session() as session:
        result = await session.execute(
            select(AgentRow).where(
                AgentRow.email_verification_token == payload.token
            )
        )
        agent = result.scalar_one_or_none()
        if not agent:
            raise HTTPException(status_code=404, detail="token_invalid")
        agent.email_verified = True
        agent.email_verification_token = None
        await session.commit()
    return {"status": "verified"}


# ---------- Password reset ----------


class ForgotPasswordPayload(BaseModel):
    email: str


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordPayload) -> dict:
    """Send a password-reset link. Always returns 200 regardless of
    whether the email exists — no account enumeration."""
    from .email import send_password_reset_email
    from .service import _normalize_email

    email_norm = _normalize_email(payload.email)
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(minutes=30)
    site = settings.site_url.rstrip("/")
    reset_url = f"{site}/login/reset-password?token={token}"

    async with db.async_session() as session:
        result = await session.execute(
            select(AgentRow).where(AgentRow.email == email_norm)
        )
        agent = result.scalar_one_or_none()
        if agent and agent.password_hash:
            agent.password_reset_token = token
            agent.password_reset_expires = expires
            await session.commit()
            await send_password_reset_email(email_norm, agent.name, reset_url)

    return {"status": "sent"}


class ResetPasswordPayload(BaseModel):
    token: str
    new_password: str


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordPayload) -> dict:
    """Exchange a reset token + new password. Token is consumed on use."""
    from .service import hash_password

    if len(payload.new_password) < 8:
        raise HTTPException(status_code=422, detail="password_too_short")

    now = datetime.now(timezone.utc)
    async with db.async_session() as session:
        result = await session.execute(
            select(AgentRow).where(
                AgentRow.password_reset_token == payload.token
            )
        )
        agent = result.scalar_one_or_none()
        if not agent:
            raise HTTPException(status_code=404, detail="token_invalid")
        if agent.password_reset_expires and agent.password_reset_expires < now:
            raise HTTPException(status_code=410, detail="token_expired")

        agent.password_hash = hash_password(payload.new_password)
        agent.password_reset_token = None
        agent.password_reset_expires = None
        await session.commit()

    return {"status": "password_updated"}


# ---------- Me ----------


@router.get("/me", response_model=MeResponse)
async def me(request: Request) -> MeResponse:
    """Return the current signed-in agent.

    401 if no session. The frontend uses this on mount to hydrate auth
    state and gate protected routes."""
    agent = await get_current_agent_optional(request)
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="not_authenticated",
        )

    # Recover the session row to surface expiry — validate_session was
    # already called by the dependency, so we need one more round-trip.
    from .service import validate_session
    token = extract_session_token(request)
    result = await validate_session(token)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="session_invalid",
        )
    agent, session = result
    return MeResponse(
        agent=_agent_to_current_user(agent),
        expires_at=session.expires_at,
    )


# ---------- Logout ----------


@router.post("/logout")
async def logout(request: Request, response: Response) -> dict:
    """Invalidate the current session and clear the cookie. Idempotent."""
    token = extract_session_token(request)
    if token:
        await delete_session(token)
    _clear_session_cookie(response)
    return {"status": "ok"}


# ---------- Dev-only: sign in as a seed agent ----------


@router.post("/dev-login")
async def dev_login(agent_id: UUID, response: Response) -> dict:
    """Sign in as an existing agent. Disabled outside development.

    Used by Muhammad / the team to test authenticated flows without running
    the invite dance. Returns 404 in any non-development environment so
    the endpoint isn't even discoverable in prod."""
    if settings.app_env != "development":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    session = await create_dev_session_for_agent(agent_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="agent_not_found")
    _set_session_cookie(response, session.session_token)
    return {
        "status": "ok",
        "agent_id": str(session.agent_id),
        "session_token": session.session_token,
    }
