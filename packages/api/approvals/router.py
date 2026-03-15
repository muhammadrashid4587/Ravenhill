"""Approval flow — human-in-the-loop for sensitive actions.

When an agent wants to share a file or take an action above the trust threshold,
the owning employee gets a pop-up with approve/deny options.
"""

from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"


class ApprovalRequest(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    requesting_agent: UUID
    owning_agent: UUID
    action: str  # e.g., "share_file", "access_data"
    description: str  # Human-readable summary shown in the pop-up
    resource: str  # What's being requested (file name, data type, etc.)
    status: ApprovalStatus = ApprovalStatus.PENDING
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ApprovalDecision(BaseModel):
    status: ApprovalStatus


# In-memory store for demo
_pending_approvals: dict[UUID, ApprovalRequest] = {}


@router.post("/request", response_model=ApprovalRequest)
async def create_approval(request: ApprovalRequest):
    """Create a new approval request (triggers pop-up for the owning employee)."""
    _pending_approvals[request.id] = request
    return request


@router.get("/pending", response_model=list[ApprovalRequest])
async def list_pending():
    """List all pending approval requests."""
    return [r for r in _pending_approvals.values() if r.status == ApprovalStatus.PENDING]


@router.post("/{approval_id}/decide", response_model=ApprovalRequest)
async def decide(approval_id: UUID, decision: ApprovalDecision):
    """Approve or deny a request."""
    request = _pending_approvals.get(approval_id)
    if not request:
        raise HTTPException(status_code=404, detail="Approval request not found")

    request.status = decision.status
    return request
