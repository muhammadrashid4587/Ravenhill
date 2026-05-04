"""HTTP router for Google Workspace endpoints — Calendar / Drive / Gmail."""

from fastapi import APIRouter, Depends, HTTPException, Query

from auth.deps import get_current_agent
from db import AgentRow
from integrations.google_meet import (
    _coerce_agent_uuid,
    _has_tokens,
    _is_configured,
    get_auth_url,
    handle_auth_callback,
)
from integrations.google_tokens import delete_tokens
from integrations.workspace.adapters import (
    ingest_gmail_topics,
    list_calendar_events,
    list_drive_files,
    list_drive_folders,
    list_gmail_threads,
    read_drive_file_content,
)
from integrations.workspace.agent_surfaces import (
    build_pre_meeting_brief,
    triage_inbox,
)

router = APIRouter()


@router.get("/calendar/events")
async def calendar_events(caller: AgentRow = Depends(get_current_agent)):
    try:
        return await list_calendar_events(str(caller.id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/drive/files")
async def drive_files(caller: AgentRow = Depends(get_current_agent)):
    try:
        return await list_drive_files(str(caller.id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/drive/file-content")
async def drive_file_content(
    file_id: str = Query(...),
    caller: AgentRow = Depends(get_current_agent),
):
    try:
        return await read_drive_file_content(str(caller.id), file_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/drive/folders")
async def drive_folders(caller: AgentRow = Depends(get_current_agent)):
    try:
        return await list_drive_folders(str(caller.id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/gmail/threads")
async def gmail_threads(
    limit: int = Query(default=25, ge=1, le=100),
    caller: AgentRow = Depends(get_current_agent),
):
    try:
        return await list_gmail_threads(str(caller.id), limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/gmail/ingest")
async def gmail_ingest(
    limit: int = Query(default=25, ge=1, le=100),
    caller: AgentRow = Depends(get_current_agent),
):
    """Pull recent Gmail threads and forward topic signals to the graph."""
    try:
        return await ingest_gmail_topics(str(caller.id), limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---- Agent surfaces: triage + pre-meeting brief ----


@router.get("/gmail/triage")
async def gmail_triage(caller: AgentRow = Depends(get_current_agent)):
    """Agent picks the top-3 threads that need the user's attention and
    returns why + urgency. Falls back to heuristic ranking when the LLM
    is unavailable."""
    try:
        return await triage_inbox(str(caller.id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/calendar/brief")
async def calendar_brief(
    event_id: str = Query(...),
    caller: AgentRow = Depends(get_current_agent),
):
    """Pre-meeting brief for a calendar event. Pulls attendees + recent
    Gmail threads mentioning them and asks the agent for a 3-bullet
    brief (context / what's at stake / suggested opening)."""
    try:
        return await build_pre_meeting_brief(str(caller.id), event_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="event_not_found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---- Google OAuth surface ----


@router.get("/google/status")
async def google_status(caller: AgentRow = Depends(get_current_agent)):
    """Per-agent Google connection status. Scopes cover Calendar + Drive + Gmail."""
    agent_id = str(caller.id)
    configured = _is_configured()
    connected = await _has_tokens(agent_id) if configured else False
    return {
        "configured": configured,
        "connected": connected,
        "agent_id": agent_id,
        "scopes": [
            "calendar.readonly",
            "drive.readonly",
            "gmail.readonly",
            "contacts.readonly",
            "contacts.other.readonly",
        ],
    }


@router.get("/google/auth-url")
async def google_auth_url(caller: AgentRow = Depends(get_current_agent)):
    """Start the OAuth flow. Returns the URL the user should visit."""
    try:
        url = await get_auth_url()
        return {"auth_url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/google/callback")
async def google_callback(
    code: str = Query(...),
    caller: AgentRow = Depends(get_current_agent),
):
    """Exchange the authorization code for tokens and store them per-agent."""
    try:
        return await handle_auth_callback(code, str(caller.id))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/google/disconnect")
async def google_disconnect(caller: AgentRow = Depends(get_current_agent)):
    """Drop the agent's stored Google tokens from Postgres."""
    agent_id = str(caller.id)
    uid = _coerce_agent_uuid(agent_id)
    deleted = await delete_tokens(uid) if uid is not None else False
    return {"status": "disconnected", "agent_id": agent_id, "deleted": deleted}
