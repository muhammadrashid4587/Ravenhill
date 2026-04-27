"""Org control plane endpoints.

Day 2 surface area:
  - `GET /api/orgs/me` — who am I, which org, how many members?
  - `POST /api/orgs/rotate-invite-code` — admin-only, mint a new share-link.

Self-serve org creation already happens implicitly in `auth.service`
(`_ensure_agent_has_org`), so there's no public `POST /` here yet. A
dedicated create endpoint can land when we build the multi-org UI.
"""

import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select

from auth.deps import get_current_agent
from auth.service import create_invite, find_org_by_invite_code
import db
from db import AgentRow, OrganizationRow, with_org


router = APIRouter()


class OrgSummary(BaseModel):
    id: UUID
    name: str
    slug: str
    org_role: str  # the caller's role within the org
    member_count: int
    invite_code: str | None  # only populated for admins
    invite_code_expires_at: datetime | None
    invite_approval_required: bool


@router.get("/me", response_model=OrgSummary)
async def get_my_org(agent: AgentRow = Depends(get_current_agent)):
    """Return the caller's org, with invite_code visible only to admins."""
    if not agent.org_id:
        raise HTTPException(status_code=404, detail="no_org")

    async with db.async_session() as session:
        org = await session.get(OrganizationRow, agent.org_id)
        if not org:
            raise HTTPException(status_code=404, detail="no_org")

        member_count = await session.scalar(
            with_org(
                select(func.count()).select_from(AgentRow),
                AgentRow,
                agent.org_id,
            )
        )

    is_admin = (agent.org_role or "member") == "admin"
    return OrgSummary(
        id=org.id,
        name=org.name,
        slug=org.slug,
        org_role=agent.org_role or "member",
        member_count=member_count or 0,
        # Leaking the share-link to non-admins would let any member invite
        # strangers, which defeats the approval-required toggle.
        invite_code=org.invite_code if is_admin else None,
        invite_code_expires_at=org.invite_code_expires_at if is_admin else None,
        invite_approval_required=org.invite_approval_required,
    )


class InviteMemberPayload(BaseModel):
    email: EmailStr
    name: str
    role: str = "Employee"
    department: str = "General"


class InviteMemberResponse(BaseModel):
    invite_url: str
    token: str
    expires_at: datetime


@router.post("/invite", response_model=InviteMemberResponse)
async def invite_member(
    payload: InviteMemberPayload,
    agent: AgentRow = Depends(get_current_agent),
):
    """Issue a single-use email invite scoped to the caller's org. Admin-only.

    The returned `invite_url` is what the admin sends to the invitee
    out-of-band. When the invitee verifies the token, `consume_invite`
    reads the stamped `org_id` off the invite row and places the new
    agent in this org as a `member`.
    """
    if (agent.org_role or "member") != "admin":
        raise HTTPException(status_code=403, detail="admin_required")
    if not agent.org_id:
        raise HTTPException(status_code=404, detail="no_org")

    row, invite_url = await create_invite(
        email=payload.email,
        name=payload.name,
        role=payload.role,
        department=payload.department,
        org_id=agent.org_id,
    )
    return InviteMemberResponse(
        invite_url=invite_url,
        token=row.token,
        expires_at=row.expires_at,
    )


class RotateInviteResponse(BaseModel):
    invite_code: str
    expires_at: datetime


@router.post("/rotate-invite-code", response_model=RotateInviteResponse)
async def rotate_invite_code(agent: AgentRow = Depends(get_current_agent)):
    """Mint a fresh share-link token for the caller's org. Admin-only.

    The new token replaces the old one immediately; any links floating
    around with the previous token stop working. Expiry defaults to 30
    days so an abandoned share-link auto-disables without admin action.
    """
    if (agent.org_role or "member") != "admin":
        raise HTTPException(status_code=403, detail="admin_required")
    if not agent.org_id:
        raise HTTPException(status_code=404, detail="no_org")

    new_code = secrets.token_urlsafe(24)
    expires_at = datetime.now(timezone.utc) + timedelta(days=30)

    async with db.async_session() as session:
        org = await session.get(OrganizationRow, agent.org_id)
        if not org:
            raise HTTPException(status_code=404, detail="no_org")
        org.invite_code = new_code
        org.invite_code_expires_at = expires_at
        org.updated_at = datetime.now(timezone.utc)
        await session.commit()

    return RotateInviteResponse(invite_code=new_code, expires_at=expires_at)


class ShareLinkPreview(BaseModel):
    name: str
    slug: str
    approval_required: bool


@router.get("/join/{invite_code}", response_model=ShareLinkPreview)
async def preview_share_link(invite_code: str):
    """Public: resolve a share-link code to a lightweight org preview.

    The frontend hits this before the signup form so it can render
    "You're joining {name}" without exposing membership, agents, or any
    other tenant data. Returns 404 for unknown or expired codes.
    """
    org = await find_org_by_invite_code(invite_code)
    if org is None:
        raise HTTPException(status_code=404, detail="invite_invalid")
    return ShareLinkPreview(
        name=org.name,
        slug=org.slug,
        approval_required=org.invite_approval_required,
    )
