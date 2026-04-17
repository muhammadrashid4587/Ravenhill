"""Auth HTTP routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from config import settings
from db import AgentRow

from .deps import get_current_agent_optional, require_admin_token
from .email import send_signin_email
from .models import (
    AccessRequestPayload,
    AccessRequestResponse,
    CurrentUserAgent,
    InvitePayload,
    InviteResponse,
    MeResponse,
    SignInRequestPayload,
    SignInRequestResponse,
    VerifyPayload,
)
from .service import (
    SignInError,
    consume_invite,
    create_dev_session_for_agent,
    create_invite,
    create_signin_token,
    delete_session,
    record_access_request,
)

router = APIRouter()


def _set_session_cookie(response: Response, token: str) -> None:
    secure = settings.site_url.startswith("https://")
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_days * 24 * 60 * 60,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    secure = settings.site_url.startswith("https://")
    response.set_cookie(
        key=settings.session_cookie_name,
        value="",
        max_age=0,
        httponly=True,
        secure=secure,
        samesite="lax",
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
    """Self-serve sign-in: email us and, if you're on the allowlist, we
    email you a fresh one-shot login link.

    404 with `email_not_admitted` if the email isn't tied to an active
    Agent — the frontend uses that to route the visitor to request-access.
    429 with `too_frequent` if a link was issued in the last minute.
    """
    try:
        agent, _invite, invite_url = await create_signin_token(payload.email)
    except SignInError as e:
        if e.code == "email_not_admitted":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="email_not_admitted",
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
    }


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
    token = request.cookies.get(settings.session_cookie_name, "")
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
    token = request.cookies.get(settings.session_cookie_name, "")
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
    return {"status": "ok", "agent_id": str(session.agent_id)}
