"""Feedback endpoint — accepts free-text submissions from any user
(logged-in or not) and stores to `feedback_submissions`. No external
delivery (no email, no Slack, no analytics) — by design, per the
product spec.

Admin readers can pull with `GET /api/feedback` once we add an admin
auth flow; for now, this module is write-only from the public side.
"""

from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from auth.deps import get_current_agent_optional
import db
from db import AgentRow, FeedbackSubmissionRow

router = APIRouter()


CATEGORIES = ("bug", "idea", "praise", "other")
Category = Literal["bug", "idea", "praise", "other"]


class FeedbackPayload(BaseModel):
    category: Category = "other"
    body: str = Field(min_length=1, max_length=4000)
    page_url: str | None = None


class FeedbackResponse(BaseModel):
    id: str
    status: Literal["received"]


@router.post("/", response_model=FeedbackResponse)
async def submit_feedback(
    payload: FeedbackPayload,
    request: Request,
    caller: AgentRow | None = Depends(get_current_agent_optional),
) -> FeedbackResponse:
    """Persist a user's feedback. Anonymous submissions accepted (no
    auth required) — `agent_id` and `org_id` are filled when the
    submitter is signed in, otherwise null."""
    user_agent = request.headers.get("user-agent", "")[:500]

    async with db.async_session() as session:
        row = FeedbackSubmissionRow(
            org_id=caller.org_id if caller else None,
            agent_id=caller.id if caller else None,
            category=payload.category,
            body=payload.body.strip(),
            page_url=(payload.page_url or "")[:500] or None,
            user_agent=user_agent or None,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return FeedbackResponse(id=str(row.id), status="received")


@router.get("/count")
async def feedback_count() -> dict:
    """Lightweight count endpoint — no auth, just total. Useful for
    dev-time sanity that submissions are landing."""
    async with db.async_session() as session:
        rows = (await session.execute(select(FeedbackSubmissionRow.id))).scalars().all()
        return {"count": len(rows)}
