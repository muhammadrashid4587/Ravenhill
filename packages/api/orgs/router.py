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

from auth.deps import get_current_agent, require_admin_token
from auth.service import create_invite, find_org_by_invite_code
from config import settings
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


class OrgUpdatePayload(BaseModel):
    name: str | None = None


@router.patch("/me", response_model=OrgSummary)
async def update_my_org(
    payload: OrgUpdatePayload,
    agent: AgentRow = Depends(get_current_agent),
):
    """Rename the caller's workspace. Admin-only."""
    if (agent.org_role or "member") != "admin":
        raise HTTPException(status_code=403, detail="admin_required")
    if not agent.org_id:
        raise HTTPException(status_code=404, detail="no_org")

    async with db.async_session() as session:
        org = await session.get(OrganizationRow, agent.org_id)
        if not org:
            raise HTTPException(status_code=404, detail="no_org")
        if payload.name is not None:
            org.name = payload.name.strip()[:200]
            org.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(org)

        member_count = await session.scalar(
            with_org(
                select(func.count()).select_from(AgentRow),
                AgentRow,
                agent.org_id,
            )
        )

    is_admin = True
    return OrgSummary(
        id=org.id,
        name=org.name,
        slug=org.slug,
        org_role="admin",
        member_count=member_count or 0,
        invite_code=org.invite_code if is_admin else None,
        invite_code_expires_at=org.invite_code_expires_at if is_admin else None,
        invite_approval_required=org.invite_approval_required,
    )


class OrgMember(BaseModel):
    id: UUID
    name: str
    email: str
    role: str
    org_role: str
    seniority: str
    is_active: bool
    created_at: str | None


@router.get("/members", response_model=list[OrgMember])
async def list_members(
    agent: AgentRow = Depends(get_current_agent),
):
    """List all members of the caller's org. All users can see the roster
    (for the People panel, etc.); deactivation is admin-only (future)."""
    if not agent.org_id:
        raise HTTPException(status_code=404, detail="no_org")

    async with db.async_session() as session:
        stmt = with_org(
            select(AgentRow).where(AgentRow.is_active.is_(True)),
            AgentRow,
            agent.org_id,
        ).order_by(AgentRow.name)
        rows = (await session.execute(stmt)).scalars().all()
        return [
            OrgMember(
                id=r.id,
                name=r.name,
                email=r.email or "",
                role=r.role,
                org_role=r.org_role or "member",
                seniority=r.seniority or "mid",
                is_active=r.is_active,
                created_at=r.created_at.isoformat() if r.created_at else None,
            )
            for r in rows
        ]


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


# ---------- Admin-gated tenant provisioning ----------


class ProvisionTenantPayload(BaseModel):
    name: str
    admin_email: str


class ProvisionTenantResponse(BaseModel):
    org_id: UUID
    name: str
    setup_token: str
    setup_url: str
    expires_at: str


def _slugify(text: str) -> str:
    import re
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:60] or "workspace"


@router.post(
    "/provision",
    response_model=ProvisionTenantResponse,
    dependencies=[Depends(require_admin_token)],
)
async def provision_tenant(payload: ProvisionTenantPayload) -> ProvisionTenantResponse:
    """Create a new company workspace and return a one-time setup URL
    for the customer admin. The admin visits the URL, creates their
    account, and becomes the owner of this workspace.

    Admin-token-gated (X-Admin-Token header). This is the production
    path for onboarding real companies — NOT self-serve signup.
    """
    setup_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    invite_code = secrets.token_urlsafe(24)
    slug = _slugify(payload.name) + "-" + secrets.token_hex(3)

    async with db.async_session() as session:
        org = OrganizationRow(
            name=payload.name.strip()[:200],
            slug=slug,
            invite_code=invite_code,
            invite_code_expires_at=datetime.now(timezone.utc) + timedelta(days=30),
            setup_token=setup_token,
            setup_token_expires_at=expires_at,
        )
        session.add(org)
        await session.commit()
        await session.refresh(org)

    site = settings.site_url.rstrip("/")
    setup_url = f"{site}/login?setup={setup_token}"

    return ProvisionTenantResponse(
        org_id=org.id,
        name=org.name,
        setup_token=setup_token,
        setup_url=setup_url,
        expires_at=expires_at.isoformat(),
    )


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
