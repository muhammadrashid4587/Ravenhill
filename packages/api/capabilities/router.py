"""Capabilities HTTP — drives the shadow-settings UI.

`GET /api/capabilities` returns the full registry × the caller's saved
permissions. `PUT /api/capabilities/{tool_id}` flips a permission and
marks it as user-set so the UI can distinguish defaults from
explicit choices.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.deps import get_current_agent
from db import AgentRow

from . import service
from .registry import REGISTRY, Lane, Permission

router = APIRouter()


class CapabilityOut(BaseModel):
    tool_id: str
    name: str
    description: str
    lane: Lane
    default: Permission
    permission: Permission
    source: Literal["default", "user", "learned"]
    requires_integration: str | None
    updated_at: str | None


class CapabilityListResponse(BaseModel):
    capabilities: list[CapabilityOut]


class UpdateCapabilityRequest(BaseModel):
    permission: Permission


@router.get("/", response_model=CapabilityListResponse)
async def list_capabilities(
    caller: AgentRow = Depends(get_current_agent),
) -> CapabilityListResponse:
    """List every capability the agent could exercise, with the
    caller's current permission for each. Order matches the registry
    so the UI can group by lane in declaration order."""
    pairs = await service.list_for_agent(caller.id, caller.org_id)
    out: list[CapabilityOut] = []
    for cap, row in pairs:
        out.append(
            CapabilityOut(
                tool_id=cap.tool_id,
                name=cap.name,
                description=cap.description,
                lane=cap.lane,
                default=cap.default,
                permission=row.permission,  # type: ignore[arg-type]
                source=row.source,  # type: ignore[arg-type]
                requires_integration=cap.requires_integration,
                updated_at=row.updated_at.isoformat() if row.updated_at else None,
            )
        )
    return CapabilityListResponse(capabilities=out)


@router.put("/{tool_id}", response_model=CapabilityOut)
async def update_capability(
    tool_id: str,
    req: UpdateCapabilityRequest,
    caller: AgentRow = Depends(get_current_agent),
) -> CapabilityOut:
    """Flip the caller's permission for a single tool. Marks
    `source=user` so the UI can show that the choice is explicit."""
    try:
        row = await service.set_permission(
            caller.id, tool_id, req.permission, caller.org_id
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="unknown_tool_id")

    cap = next(c for c in REGISTRY if c.tool_id == tool_id)
    return CapabilityOut(
        tool_id=cap.tool_id,
        name=cap.name,
        description=cap.description,
        lane=cap.lane,
        default=cap.default,
        permission=row.permission,  # type: ignore[arg-type]
        source=row.source,  # type: ignore[arg-type]
        requires_integration=cap.requires_integration,
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )
