"""HTTP routes for the People surface."""

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select

import db
from auth.deps import get_current_agent
from db import AgentRow
from integrations.workspace.adapters import list_google_contacts

router = APIRouter()


def _domain_of(email: str) -> str | None:
    if not email or "@" not in email:
        return None
    return email.split("@", 1)[1].strip().lower() or None


@router.get("/")
async def list_people(
    caller: AgentRow = Depends(get_current_agent),
) -> list[dict[str, Any]]:
    """Return active Ravenhill agents the caller already knows.

    The set is the union of:
    - agents whose email is in the caller's Google contacts, AND
    - agents who share the caller's email domain.

    Each entry carries a `sources` array (`"contact"` / `"domain"`) so the
    UI can show why someone showed up. The caller themselves is filtered out.
    """
    contacts = await list_google_contacts(str(caller.id))
    contact_emails: set[str] = {
        (c.get("email") or "").strip().lower()
        for c in contacts
        if c.get("email")
    }

    caller_email = (caller.email or "").strip().lower()
    caller_domain = _domain_of(caller_email)

    async with db.async_session() as session:
        result = await session.execute(
            select(AgentRow).where(
                AgentRow.is_active.is_(True),
                AgentRow.email.isnot(None),
                AgentRow.email != "",
            )
        )
        rows = result.scalars().all()

    out: list[dict[str, Any]] = []
    for agent in rows:
        email = (agent.email or "").strip().lower()
        if not email or email == caller_email:
            continue

        sources: list[str] = []
        if email in contact_emails:
            sources.append("contact")
        if caller_domain and _domain_of(email) == caller_domain:
            sources.append("domain")

        if not sources:
            continue

        out.append({
            "id": str(agent.id),
            "name": agent.name,
            "email": agent.email,
            "role": agent.role,
            "departments": list(agent.departments or []),
            "sources": sources,
        })

    out.sort(key=lambda p: ("domain" not in p["sources"], p["name"].lower()))
    return out
