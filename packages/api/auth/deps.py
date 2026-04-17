"""FastAPI dependencies for authentication."""

from fastapi import HTTPException, Request, status

from config import settings
from db import AgentRow
from .service import validate_session


async def get_current_agent(request: Request) -> AgentRow:
    """Extract the session cookie, validate it, return the signed-in Agent.

    Raises 401 if there's no cookie, the session is expired, or the agent
    is disabled."""
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="not_authenticated",
        )
    result = await validate_session(token)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="session_invalid",
        )
    agent, _session = result
    return agent


async def get_current_agent_optional(request: Request) -> AgentRow | None:
    """Same as get_current_agent but returns None instead of raising.
    Useful for endpoints that behave slightly differently for signed-in vs
    anonymous callers (e.g., `/api/auth/me`)."""
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    result = await validate_session(token)
    if result is None:
        return None
    agent, _session = result
    return agent


def require_admin_token(request: Request) -> None:
    """Gate admin endpoints on a shared-secret header.

    If `ADMIN_TOKEN` is unset, admin endpoints are disabled entirely
    (fail-closed). This is deliberate — a misconfigured prod shouldn't
    leak an admin endpoint."""
    configured = settings.admin_token.strip()
    if not configured:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="not_found",
        )
    supplied = request.headers.get("x-admin-token", "").strip()
    # Constant-time comparison to avoid timing leaks.
    import hmac
    if not hmac.compare_digest(supplied, configured):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="admin_token_invalid",
        )
