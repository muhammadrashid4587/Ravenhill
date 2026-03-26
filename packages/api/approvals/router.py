"""Approval flow — human-in-the-loop for sensitive actions, backed by Postgres."""

from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

import db
from db import ApprovalRow

router = APIRouter()


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"


class ApprovalRequest(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    requesting_agent: UUID
    owning_agent: UUID
    action: str
    description: str
    resource: str
    status: ApprovalStatus = ApprovalStatus.PENDING
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ApprovalDecision(BaseModel):
    status: ApprovalStatus


def _row_to_approval(row: ApprovalRow) -> ApprovalRequest:
    return ApprovalRequest(
        id=row.id,
        requesting_agent=row.requesting_agent,
        owning_agent=row.owning_agent,
        action=row.action,
        description=row.description,
        resource=row.resource,
        status=ApprovalStatus(row.status),
        created_at=row.created_at,
    )


async def create_approval_in_db(approval: ApprovalRequest) -> ApprovalRequest:
    """Create an approval in the database. Used by orchestrator."""
    async with db.async_session() as session:
        row = ApprovalRow(
            id=approval.id,
            requesting_agent=approval.requesting_agent,
            owning_agent=approval.owning_agent,
            action=approval.action,
            description=approval.description,
            resource=approval.resource,
            status=approval.status.value,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return _row_to_approval(row)


async def get_approval_from_db(approval_id: UUID) -> ApprovalRow | None:
    """Get an approval row from the database."""
    async with db.async_session() as session:
        return await session.get(ApprovalRow, approval_id)


@router.post("/request", response_model=ApprovalRequest)
async def create_approval(request: ApprovalRequest):
    """Create a new approval request."""
    return await create_approval_in_db(request)


@router.get("/pending", response_model=list[ApprovalRequest])
async def list_pending():
    """List all pending approval requests."""
    async with db.async_session() as session:
        result = await session.execute(
            select(ApprovalRow)
            .where(ApprovalRow.status == "pending")
            .order_by(ApprovalRow.created_at.desc())
        )
        rows = result.scalars().all()
        return [_row_to_approval(r) for r in rows]


@router.get("/{approval_id}", response_model=ApprovalRequest)
async def get_approval(approval_id: UUID):
    """Get an approval request by ID."""
    async with db.async_session() as session:
        row = await session.get(ApprovalRow, approval_id)
        if not row:
            raise HTTPException(status_code=404, detail="Approval request not found")
        return _row_to_approval(row)


@router.post("/{approval_id}/decide", response_model=ApprovalRequest)
async def decide(approval_id: UUID, decision: ApprovalDecision):
    """Approve or deny a request."""
    async with db.async_session() as session:
        row = await session.get(ApprovalRow, approval_id)
        if not row:
            raise HTTPException(status_code=404, detail="Approval request not found")

        row.status = decision.status.value
        await session.commit()
        await session.refresh(row)
        return _row_to_approval(row)
