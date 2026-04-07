"""Approval flow — human-in-the-loop for sensitive actions, backed by Postgres.

Includes WebSocket connection manager for real-time approval notifications.
"""

import json
import logging
from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy import select

import db
from db import ApprovalRow

log = logging.getLogger("approvals")

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


# ---------------------------------------------------------------------------
# WebSocket Connection Manager
# ---------------------------------------------------------------------------

class WSConnectionManager:
    """Manage WebSocket connections keyed by agent_id."""

    def __init__(self):
        self.connections: dict[str, list[WebSocket]] = {}

    async def connect(self, agent_id: str, websocket: WebSocket):
        await websocket.accept()
        if agent_id not in self.connections:
            self.connections[agent_id] = []
        self.connections[agent_id].append(websocket)
        log.info(f"[ws] Agent {agent_id} connected. Total: {len(self.connections[agent_id])}")

    def disconnect(self, agent_id: str, websocket: WebSocket):
        if agent_id in self.connections:
            self.connections[agent_id] = [
                ws for ws in self.connections[agent_id] if ws != websocket
            ]
            if not self.connections[agent_id]:
                del self.connections[agent_id]
        log.info(f"[ws] Agent {agent_id} disconnected.")

    async def broadcast_to_agent(self, agent_id: str, data: dict):
        """Send a message to all WebSocket connections for a given agent."""
        if agent_id not in self.connections:
            log.info(f"[ws] No connections for agent {agent_id}")
            return
        dead = []
        for ws in self.connections[agent_id]:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)
        # Clean up dead connections
        for ws in dead:
            self.connections[agent_id] = [
                c for c in self.connections.get(agent_id, []) if c != ws
            ]

    async def close_all(self):
        """Close all WebSocket connections. Used during demo reset."""
        for agent_id, connections in list(self.connections.items()):
            for ws in connections:
                try:
                    await ws.close(code=1000, reason="Demo reset")
                except Exception:
                    pass
            self.connections.pop(agent_id, None)
        log.info("[ws] All connections closed (demo reset)")


ws_manager = WSConnectionManager()


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# HTTP Endpoints
# ---------------------------------------------------------------------------

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
    """Approve or deny a request. Broadcasts result via WebSocket."""
    async with db.async_session() as session:
        row = await session.get(ApprovalRow, approval_id)
        if not row:
            raise HTTPException(status_code=404, detail="Approval request not found")

        row.status = decision.status.value
        await session.commit()
        await session.refresh(row)

        approval = _row_to_approval(row)

    # Broadcast resolution to both parties
    resolution_msg = {
        "type": "approval_resolved",
        "approval_id": str(approval_id),
        "status": decision.status.value,
    }
    await ws_manager.broadcast_to_agent(str(approval.owning_agent), resolution_msg)
    await ws_manager.broadcast_to_agent(str(approval.requesting_agent), resolution_msg)

    return approval


# ---------------------------------------------------------------------------
# WebSocket Endpoints
# ---------------------------------------------------------------------------

@router.websocket("/ws/{agent_id}")
async def ws_approval(websocket: WebSocket, agent_id: str):
    """WebSocket endpoint for real-time approval notifications."""
    await ws_manager.connect(agent_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
                continue

            # Handle JSON messages (e.g. context requests from approval screen)
            try:
                msg = json.loads(data)
                if msg.get("type") == "context_request":
                    # Look up who requested the approval and forward to them
                    approval_id = msg.get("approval_id")
                    if approval_id:
                        async with db.async_session() as session:
                            row = await session.get(ApprovalRow, UUID(approval_id))
                        if row:
                            await ws_manager.broadcast_to_agent(
                                str(row.requesting_agent),
                                {
                                    "type": "context_request",
                                    "approval_id": approval_id,
                                    "from_agent": msg.get("from_agent", "the approver"),
                                    "message": msg.get(
                                        "message",
                                        "More context requested before approval.",
                                    ),
                                },
                            )
            except (json.JSONDecodeError, ValueError):
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect(agent_id, websocket)
    except Exception:
        ws_manager.disconnect(agent_id, websocket)


@router.get("/ws/test/{agent_id}")
async def ws_test(agent_id: str):
    """Send a test approval notification via WebSocket (for demo setup)."""
    await ws_manager.broadcast_to_agent(agent_id, {
        "type": "approval_request",
        "approval_id": "test-" + str(uuid4()),
        "requester_name": "Test User",
        "requester_role": "Test Role",
        "document_name": "Test_Document.pdf",
        "document_description": "This is a test approval notification.",
    })
    return {"status": "ok", "message": f"Test notification sent to agent {agent_id}"}
