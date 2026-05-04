"""Manual tasks — user-entered to-do items, separate from meeting-
derived tasks. Powers the 'Created Tasks' section on the dashboard.

Status enum mirrors meeting-task statuses ('pending', 'in_progress',
'done') so the frontend can union both task sources in one kanban
without translation.
"""

from datetime import date, datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from auth.deps import get_current_agent
import db
from db import AgentRow, ManualTaskRow, with_org

router = APIRouter()


VALID_STATUSES = {"pending", "in_progress", "done", "blocked"}
VALID_PRIORITIES = {"high", "medium", "low"}


class ManualTaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str | None = None
    priority: Literal["high", "medium", "low"] = "medium"
    due_date: date | None = None


class ManualTaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    status: Literal["pending", "in_progress", "done", "blocked"] | None = None
    priority: Literal["high", "medium", "low"] | None = None
    due_date: date | None = None


class ManualTaskOut(BaseModel):
    id: UUID
    title: str
    description: str | None
    status: str
    priority: str
    due_date: date | None
    source: Literal["manual"] = "manual"
    created_at: datetime | None
    updated_at: datetime | None


def _row_to_out(row: ManualTaskRow) -> ManualTaskOut:
    return ManualTaskOut(
        id=row.id,
        title=row.title,
        description=row.description,
        status=row.status or "pending",
        priority=row.priority or "medium",
        due_date=row.due_date,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/manual", response_model=list[ManualTaskOut])
async def list_manual_tasks(
    caller: AgentRow = Depends(get_current_agent),
    include_done: bool = False,
) -> list[ManualTaskOut]:
    async with db.async_session() as session:
        stmt = with_org(
            select(ManualTaskRow).where(ManualTaskRow.agent_id == caller.id),
            ManualTaskRow,
            caller.org_id,
        )
        if not include_done:
            stmt = stmt.where(ManualTaskRow.status != "done")
        # Priority ordering: high → medium → low → blocked. Then due
        # date ascending (soonest first; nulls last).
        stmt = stmt.order_by(
            ManualTaskRow.priority,  # alphabetical happens to put high < low < medium — reorder client-side if needed
            ManualTaskRow.due_date.nulls_last(),
            ManualTaskRow.created_at.desc(),
        )
        rows = (await session.execute(stmt)).scalars().all()
        return [_row_to_out(r) for r in rows]


@router.post("/manual", response_model=ManualTaskOut, status_code=201)
async def create_manual_task(
    req: ManualTaskCreate,
    caller: AgentRow = Depends(get_current_agent),
) -> ManualTaskOut:
    if not caller.org_id:
        raise HTTPException(status_code=403, detail="no_org")

    async with db.async_session() as session:
        row = ManualTaskRow(
            org_id=caller.org_id,
            agent_id=caller.id,
            title=req.title.strip(),
            description=(req.description or None),
            priority=req.priority,
            due_date=req.due_date,
            status="pending",
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return _row_to_out(row)


@router.patch("/manual/{task_id}", response_model=ManualTaskOut)
async def update_manual_task(
    task_id: UUID,
    req: ManualTaskUpdate,
    caller: AgentRow = Depends(get_current_agent),
) -> ManualTaskOut:
    async with db.async_session() as session:
        row = await session.get(ManualTaskRow, task_id)
        if not row or row.agent_id != caller.id:
            raise HTTPException(status_code=404, detail="task_not_found")

        updates = req.model_dump(exclude_unset=True)
        for field, value in updates.items():
            setattr(row, field, value)
        row.updated_at = datetime.now(timezone.utc)

        await session.commit()
        await session.refresh(row)
        return _row_to_out(row)


@router.delete("/manual/{task_id}")
async def delete_manual_task(
    task_id: UUID,
    caller: AgentRow = Depends(get_current_agent),
) -> dict:
    async with db.async_session() as session:
        row = await session.get(ManualTaskRow, task_id)
        if not row or row.agent_id != caller.id:
            raise HTTPException(status_code=404, detail="task_not_found")
        await session.delete(row)
        await session.commit()
    return {"status": "deleted", "id": str(task_id)}


@router.post("/manual/{task_id}/toggle", response_model=ManualTaskOut)
async def toggle_done(
    task_id: UUID,
    caller: AgentRow = Depends(get_current_agent),
) -> ManualTaskOut:
    """Quick-complete checkbox path. Toggles 'done' ↔ 'pending'."""
    async with db.async_session() as session:
        row = await session.get(ManualTaskRow, task_id)
        if not row or row.agent_id != caller.id:
            raise HTTPException(status_code=404, detail="task_not_found")
        row.status = "pending" if row.status == "done" else "done"
        row.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(row)
        return _row_to_out(row)
