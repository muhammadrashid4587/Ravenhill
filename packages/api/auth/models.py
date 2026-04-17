"""Pydantic models for the auth API."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# ---------- Request-access (public waitlist) ----------


class AccessRequestPayload(BaseModel):
    email: EmailStr
    name: str | None = None
    company: str | None = None
    role: str | None = None
    use_case: str | None = Field(default=None, max_length=2000)


class AccessRequestResponse(BaseModel):
    status: str  # always "received" — we never tell the visitor if they're already on the list


# ---------- Admin invite ----------


class InvitePayload(BaseModel):
    email: EmailStr
    name: str
    role: str = "Employee"
    department: str = "General"


class InviteResponse(BaseModel):
    invite_url: str
    token: str
    expires_at: datetime


# ---------- Verify (public; consumes a magic-link token) ----------


class VerifyPayload(BaseModel):
    token: str


# ---------- /me response ----------


class CurrentUserAgent(BaseModel):
    id: str
    name: str
    email: str
    role: str
    departments: list[str]
    scopes: list[str]


class MeResponse(BaseModel):
    agent: CurrentUserAgent
    expires_at: datetime
