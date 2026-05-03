"""Orchestrator — the brain that connects classify -> route -> answer.

New pipeline:
1. Load agents + build topic map (hash map, instant)
2. Classify intent + extract topic keys in one LLM call
3. If action_request -> handle notification or document sharing
4. Otherwise -> rank agents -> parallel query -> synthesize
5. Detect references_agent for second-hop chaining
"""

import asyncio
import json
import logging
import re
import time
from collections.abc import AsyncGenerator
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from auth.deps import get_current_agent

from activity.models import ActivityEntry, log_activity
from agents.discovery import build_topic_map, rank_agents
from agents.models import Agent
from agents.runtime import (
    classify_and_extract,
    query_agent_with_entries,
    stream_synthesis,
    synthesize_multi_agent_response,
)
from agents.seniority import filter_candidates
from approvals.router import ApprovalRequest, create_approval_in_db, ws_manager
import db
from db import AgentRow, ApprovalRow, ActivityRow, MessageLedgerRow

log = logging.getLogger("orchestrator")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

router = APIRouter()

# ---------------------------------------------------------------------------
# Session-based conversation history (in-memory, demo only)
# ---------------------------------------------------------------------------
# Key: session_id (str) -> list of {"role": "user"|"assistant", "content": str}
# Kept to last MAX_SESSION_MESSAGES per session. Cleared on demo reset.
_conversation_sessions: dict[str, list[dict[str, str]]] = {}
_tool_states: dict = {}

MAX_SESSION_MESSAGES = 10


def _get_session_history(session_id: str | None) -> list[dict[str, str]]:
    """Return the conversation history for a session, or empty list."""
    if not session_id:
        return []
    return _conversation_sessions.get(session_id, [])


def _append_to_session(session_id: str | None, role: str, content: str) -> None:
    """Append a message to the session, keeping last MAX_SESSION_MESSAGES."""
    if not session_id or not content:
        return
    if session_id not in _conversation_sessions:
        _conversation_sessions[session_id] = []
    _conversation_sessions[session_id].append({"role": role, "content": content})
    _conversation_sessions[session_id] = _conversation_sessions[session_id][
        -MAX_SESSION_MESSAGES:
    ]


def _history_as_strings(
    history: list[dict[str, str]], last_n: int | None = None,
) -> list[str]:
    """Convert session history to flat strings for LLM context.

    Format: "user: ..." or "assistant: ..."
    """
    items = history[-last_n:] if last_n else history
    return [f"{m['role']}: {m['content']}" for m in items]


class OrchestrateRequest(BaseModel):
    """Request body for the orchestrate endpoint."""
    message: str = Field(max_length=10000)
    agent_id: UUID
    session_id: str | None = None
    conversation_history: list[str] = []


class OrchestrateStep(BaseModel):
    label: str
    status: str = "done"
    detail: str = ""


class OrchestrateResponse(BaseModel):
    intent: str
    answer: str | None = None
    sources: list[str] = []
    second_hop_available: bool = False
    second_hop_agent_id: str | None = None
    second_hop_hint: str | None = None
    steps: list[OrchestrateStep] = []
    approval_id: UUID | None = None
    trace_id: str | None = None
    session_id: str | None = None
    source_agent: dict = {}
    target_agent: dict | None = None


class SecondHopRequest(BaseModel):
    agent_id: UUID
    referenced_agent_id: UUID
    original_question: str
    follow_up: str
    session_id: str | None = None


def _row_to_agent(row: AgentRow) -> Agent:
    return Agent(
        id=row.id,
        org_id=row.org_id,
        org_role=(row.org_role or "member"),
        name=row.name,
        role=row.role,
        role_description=row.role_description or "",
        departments=row.departments or [],
        knowledge_areas=row.knowledge_areas or [],
        knowledge_base=row.knowledge_base or "",
        knowledge_entries=row.knowledge_entries or [],
        topic_keys=row.topic_keys or [],
        documents=row.documents or [],
        trust_level=row.trust_level or "auto",
        scopes=row.scopes or [],
        is_active=row.is_active,
        created_at=row.created_at,
    )


async def _get_agent(agent_id: UUID, org_id: UUID | None = None) -> Agent | None:
    """Fetch an agent from the database.

    If `org_id` is provided, the agent must belong to that org — returns
    None otherwise. Prevents cross-tenant lookup of arbitrary UUIDs.
    """
    async with db.async_session() as session:
        row = await session.get(AgentRow, agent_id)
        if not row:
            return None
        if org_id is not None and row.org_id != org_id:
            return None
        return _row_to_agent(row)


async def _get_all_agents(org_id: UUID | None = None) -> list[Agent]:
    """Fetch all active agents, optionally scoped to a single org."""
    async with db.async_session() as session:
        stmt = db.with_org(
            select(AgentRow).where(AgentRow.is_active.is_(True)),
            AgentRow,
            org_id,
        )
        result = await session.execute(stmt)
        rows = result.scalars().all()
        return [_row_to_agent(r) for r in rows]


_NOTIFICATION_KW = re.compile(
    r"(notify|let\s+.+?\s+know|tell\s+.+?\s+(about|that)|update\s+.+?\s+about|inform|heads\s+up|give\s+.+?\s+(a\s+)?heads\s+up)",
    re.IGNORECASE,
)
_DISMISS_WORDS = {
    "ok", "okay", "got", "it", "thanks", "thank", "you", "cool", "great",
    "sounds", "good", "perfect", "nice", "all", "no", "worries", "noted",
    "understood", "right", "that", "works", "appreciate", "ty", "thx",
    "yep", "yup", "sure", "alright", "cheers", "bye", "later",
}

_DOC_REQUEST_KW = re.compile(
    r"(share|send\s+me|get\s+me|document|contract|file|pdf)",
    re.IGNORECASE,
)


def _is_notification(message: str) -> bool:
    """Check if the message is a notification rather than a doc request."""
    has_notify = bool(_NOTIFICATION_KW.search(message))
    has_doc = bool(_DOC_REQUEST_KW.search(message))
    # If it has doc keywords, treat as doc request, not notification
    return has_notify and not has_doc


def _find_notification_target(
    agents: list[Agent], message: str
) -> Agent | None:
    """Scan agent names, roles, and departments in the message to find who's being notified."""
    msg_lower = message.lower()
    best_agent = None
    best_score = 0

    for agent in agents:
        score = 0
        # Check name (first name, last name, full name)
        name_parts = agent.name.lower().split()
        if agent.name.lower() in msg_lower:
            score += 100
        for part in name_parts:
            if part in msg_lower:
                score += 40

        # Check role keywords
        role_words = agent.role.lower().split()
        for word in role_words:
            if len(word) > 3 and word in msg_lower:
                score += 30

        # Check department
        for dept in (agent.departments or []):
            dept_lower = dept.lower()
            if dept_lower in msg_lower:
                score += 50
            # Also check common abbreviations
            if dept_lower == "operations" and "ops" in msg_lower:
                score += 50
            if dept_lower == "engineering" and "eng" in msg_lower:
                score += 50

        if score > best_score:
            best_score = score
            best_agent = agent

    return best_agent if best_score > 0 else None


def _extract_notification_topic(message: str) -> str:
    """Extract the topic from a notification message."""
    msg_lower = message.lower()
    # Try "about X" or "that X"
    match = re.search(r"(?:about|that)\s+(.+?)(?:\.|$)", msg_lower)
    if match:
        return match.group(1).strip()
    # Try "know X" (e.g., "let them know the timeline is pushed")
    match = re.search(r"know\s+(.+?)(?:\.|$)", msg_lower)
    if match:
        return match.group(1).strip()
    # Fallback
    return "the update"


def _find_document_match(
    agents: list[Agent], message: str,
) -> tuple[Agent | None, dict | None]:
    """Find which agent owns a document matching the request.

    Uses a scoring approach: exact name match > keyword overlap > broad match.
    Returns the highest-scoring (agent, doc) pair.
    """
    msg_lower = message.lower()
    msg_words = set(msg_lower.split())

    best_agent = None
    best_doc = None
    best_score = 0

    for agent in agents:
        for doc in (agent.documents or []):
            doc_name = doc.get("name", "") if isinstance(doc, dict) else doc.name
            doc_desc = doc.get("description", "") if isinstance(doc, dict) else doc.description
            score = 0

            # Exact document name match
            if doc_name.lower() in msg_lower:
                score += 100

            # Check if message mentions the agent's department
            for dept in (agent.departments or []):
                if dept.lower() in msg_lower:
                    score += 20

            # Keyword overlap between message and document name
            name_words = set(doc_name.lower().replace("_", " ").replace(".", " ").split())
            name_overlap = msg_words & {w for w in name_words if len(w) > 3}
            score += len(name_overlap) * 10

            # Keyword-specific boosts
            if "contract" in msg_lower and (
                "msa" in doc_name.lower() or "agreement" in doc_desc.lower()
            ):
                score += 50
            if "vendor" in msg_lower and (
                "msa" in doc_name.lower() or "vendor" in doc_desc.lower()
            ):
                score += 50
            if "onboarding" in msg_lower and "onboarding" in doc_name.lower():
                score += 50

            # "ops" or "operations" in message boosts operations agent
            if any(w in msg_lower for w in ("ops", "operations")):
                if any(d.lower() == "operations" for d in (agent.departments or [])):
                    score += 30

            if score > best_score:
                best_score = score
                best_agent = agent
                best_doc = doc

    if best_score > 0:
        return best_agent, best_doc
    return None, None


def _resolve_session_id(request_session_id: str | None) -> str:
    """Return the provided session_id or generate a new one."""
    return request_session_id or str(uuid4())


def _build_conversation_context(
    session_id: str | None, fallback_history: list[str],
) -> tuple[list[str], list[str]]:
    """Build conversation context from session history (preferred) or fallback.

    Returns (classify_history, synthesis_history):
      - classify_history: last 3 messages for intent classification
      - synthesis_history: last 10 messages for synthesis context
    """
    session_history = _get_session_history(session_id)
    if session_history:
        classify = _history_as_strings(session_history, last_n=3)
        synthesis = _history_as_strings(session_history, last_n=10)
        return classify, synthesis

    # Fallback to client-provided history (backwards compat)
    if fallback_history:
        return fallback_history[-3:], fallback_history[-10:]
    return [], []


_PERSONAL_KEYWORDS = re.compile(
    r"(my\s+task|my\s+meeting|my\s+plate|what.*(?:do\s+i|should\s+i|am\s+i|i\s+have|i\s+need)|"
    r"what'?s\s+(?:on\s+my|pending|open|left|due|assigned|blocking)|"
    r"status\s+(?:of\s+my|update)|how\s+(?:am\s+i|many)|"
    r"action\s+items|to\s*-?\s*do|priorities|progress|"
    r"standup|stand\s+up|daily\s+update|report|summary\s+of\s+(?:my|today)|"
    r"what\s+(?:did\s+i|was\s+i|got\s+assigned)|"
    r"help\s+(?:me\s+with|with\s+my)|meetings?\s+(?:today|this\s+week|recent)|"
    r"update\s+(?:on\s+my|my))",
    re.IGNORECASE,
)


def _is_personal_question(message: str) -> bool:
    """Check if the message is asking about the user's own tasks/meetings/work."""
    return bool(_PERSONAL_KEYWORDS.search(message))


async def _answer_from_personal_data(
    agent: Agent,
    message: str,
    personal_context: str,
    conversation_history: list[str],
) -> str | None:
    """Try to answer using the user's personal meeting/task data only.

    Returns the answer string, or None if the data doesn't contain relevant info.
    The LLM is strictly instructed to NOT hallucinate — only use provided data.
    """
    from agents.llm_providers import call_llm, get_active_provider

    if get_active_provider() == "mock":
        return _mock_personal_answer(message, personal_context)

    history_block = ""
    if conversation_history:
        history_block = (
            "\n\nRecent conversation:\n" + "\n".join(conversation_history[-6:])
        )

    system = (
        f"You are {agent.name}'s personal AI agent.\n\n"
        f"STRICT RULES — these are non-negotiable:\n"
        f"1. ONLY answer using the data provided below. Do NOT invent any facts, "
        f"numbers, dates, names, or status information.\n"
        f"2. If the data below does not contain the answer, respond with EXACTLY "
        f"the text: NO_PERSONAL_DATA\n"
        f"3. When answering, cite specific task names, meeting titles, and dates "
        f"from the data.\n"
        f"4. Be concise and direct. Use bullet points for lists.\n"
        f"5. If asked for a status update or standup, synthesize from the task data.\n\n"
        f"--- YOUR DATA (from real meetings and tasks) ---\n"
        f"{personal_context}\n"
        f"--- END DATA ---"
        f"{history_block}"
    )

    result = await call_llm(
        system=system,
        user_message=message,
        model_tier="reasoning",
        max_tokens=1024,
    )

    if not result:
        return None

    # If the LLM says it doesn't have data, return None to fall through
    if "NO_PERSONAL_DATA" in result:
        return None

    return result


def _mock_personal_answer(message: str, personal_context: str) -> str | None:
    """Mock response for personal questions when LLM is unavailable."""
    msg = message.lower()

    if not personal_context:
        return None

    if any(w in msg for w in ("plate", "task", "to do", "todo", "pending", "open")):
        return (
            "Based on your meetings, you have tasks across your recent meetings. "
            "Here's what's open:\n\n"
            "Check your Dashboard for the full breakdown — I'm pulling this from "
            "your actual meeting data, not making it up."
        )

    if any(w in msg for w in ("standup", "stand up", "update", "report", "summary")):
        return (
            "Here's your status update based on your meeting tasks:\n\n"
            "Check your Dashboard for specific task statuses and priorities. "
            "This is pulled from your real meeting data."
        )

    if any(w in msg for w in ("meeting", "meetings")):
        return (
            "I can see your recent meetings in the system. "
            "Head to the Meetings page for full details, task breakdowns, "
            "and to ask me for help on specific tasks."
        )

    return None


async def _hydrate_google_context(agent_id: str) -> str:
    """Pull compact summaries from connected Google Workspace — Calendar
    events, recent Gmail threads, and Drive files — and format them as
    a context block the LLM can ground answers in.

    Returns an empty string when Google isn't connected or on any failure.
    This is the bridge that makes "what's on my calendar?" work in chat.
    """
    import asyncio
    from integrations.workspace.adapters import (
        _has_real_connection,
        list_calendar_events,
        list_drive_files,
        list_gmail_threads,
        list_google_contacts,
    )

    connected = await _has_real_connection(agent_id)
    log.info(f"[hydrate] agent_id={agent_id} _has_real_connection={connected}")
    if not connected:
        return ""

    # Pull all four in parallel, with a 10s cap so chat doesn't hang.
    try:
        cal_task = asyncio.create_task(list_calendar_events(agent_id))
        mail_task = asyncio.create_task(list_gmail_threads(agent_id, limit=10))
        drive_task = asyncio.create_task(list_drive_files(agent_id))
        contacts_task = asyncio.create_task(list_google_contacts(agent_id))
        results = await asyncio.wait_for(
            asyncio.gather(cal_task, mail_task, drive_task, contacts_task,
                           return_exceptions=True),
            timeout=10.0,
        )
    except asyncio.TimeoutError:
        return ""

    cal_events = results[0] if isinstance(results[0], list) else []
    mail_threads = results[1] if isinstance(results[1], list) else []
    drive_files = results[2] if isinstance(results[2], list) else []
    contacts = results[3] if isinstance(results[3], list) else []

    log.info(
        f"[hydrate] agent_id={agent_id} cal={len(cal_events)} "
        f"mail={len(mail_threads)} drive={len(drive_files)} contacts={len(contacts)}"
    )

    if not cal_events and not mail_threads and not drive_files and not contacts:
        return ""

    lines: list[str] = []
    lines.append("CONNECTED GOOGLE WORKSPACE DATA (real, live):")

    if cal_events:
        lines.append("\n📅 Upcoming calendar events:")
        for ev in cal_events[:8]:
            title = ev.get("title", "Untitled")
            start = ev.get("start_time", "")
            attendees = ev.get("attendees") or []
            att_str = f" with {', '.join(attendees[:4])}" if attendees else ""
            desc = ev.get("description") or ""
            desc_snip = f" — {desc[:80]}..." if desc and len(desc) > 10 else ""
            lines.append(f"  - {title} @ {start}{att_str}{desc_snip}")

    if mail_threads:
        lines.append("\n📧 Recent inbox threads:")
        for th in mail_threads[:8]:
            subj = th.get("subject", "(no subject)")
            frm = th.get("from", "")
            snippet = th.get("snippet", "")[:60]
            lines.append(f"  - \"{subj}\" from {frm} — {snippet}")

    if drive_files:
        lines.append("\n📁 Recent Drive files:")
        for f in drive_files[:10]:
            name = f.get("name", "Untitled")
            owner = f.get("owner", "")
            modified = f.get("last_modified", "")
            lines.append(f"  - {name} (owner: {owner}, modified: {modified})")

    if contacts:
        lines.append("\n👥 Known contacts (from Google Contacts):")
        for c in contacts[:15]:
            name = c.get("name", "")
            email = c.get("email", "")
            lines.append(f"  - {name} <{email}>")

    return "\n".join(lines)


async def _fetch_file_if_referenced(
    agent_id: str, message: str, google_block: str
) -> str:
    """If the user's message seems to ask about a specific file, search
    Drive for a name match and download the content.

    Uses the adapter's search function directly (doesn't parse the
    google_block text). Triggers on messages containing file-related
    keywords + at least 2 substantive words that could be a file name.
    """
    from integrations.workspace.adapters import (
        _has_real_connection,
        list_drive_files,
        read_drive_file_content,
    )

    if not await _has_real_connection(agent_id):
        return ""

    # Quick heuristic: does the message seem to be asking about a file?
    msg_lower = message.lower()
    file_keywords = {"file", "doc", "document", "spreadsheet", "sheet",
                     "slide", "plan", "report", "what's in", "whats in",
                     "contents of", "open", "read", "show me", "summarize",
                     "drive file", "analyze"}
    if not any(kw in msg_lower for kw in file_keywords):
        return ""

    # Get the file list and try to match by name overlap.
    try:
        files = await list_drive_files(agent_id)
    except Exception:
        return ""

    if not files:
        return ""

    msg_words = set(re.split(r"[\s_\-./]+", msg_lower))
    best_match = None
    best_score = 0
    for f in files:
        name = f.get("name", "")
        name_lower = name.lower()
        # Full substring match (strip common extensions first)
        name_bare = re.sub(r"\.\w{1,5}$", "", name_lower)
        if name_bare in msg_lower:
            best_match = f
            best_score = 100
            break
        # Word overlap scoring — split on spaces, underscores, hyphens, dots
        name_words = set(re.split(r"[\s_\-./]+", name_bare))
        overlap = name_words & msg_words
        if len(overlap) >= 2 and len(overlap) > best_score:
            best_score = len(overlap)
            best_match = f

    if not best_match or best_score < 2:
        return ""

    matched_name = best_match.get("name", "")
    file_id = best_match.get("id", "")
    if not file_id:
        return ""

    try:
        result = await read_drive_file_content(agent_id, file_id)
    except Exception:
        return f"\n📄 Tried to read '{matched_name}' but the download failed."

    content = result.get("content", "")
    if not content:
        error = result.get("error", "")
        if error:
            return f"\n📄 FILE '{matched_name}': {error}"
        return ""

    truncated = " (truncated to 32KB)" if result.get("truncated") else ""
    return (
        f"\n📄 FULL CONTENT of '{matched_name}'{truncated}:\n"
        f"--- BEGIN FILE ---\n{content}\n--- END FILE ---"
    )


async def _conversational_fallback(
    agent: Agent,
    message: str,
    conversation_history: list[str],
    session_id: str | None = None,
) -> str:
    """Respond using tools (Drive/Gmail/Calendar) + LLM.

    Flow:
    1. Check Google connection
    2. Route tools (drive.search, drive.read) based on message
    3. If tools fired, build focused prompt with tool results
    4. Otherwise, hydrate broad Google context for general questions
    5. Call LLM with the assembled context
    """
    from agents.llm_providers import call_llm
    from tools.router import ToolState, route_tools

    agent_id_str = str(agent.id)

    # Get or create per-session tool state
    tool_state = _tool_states.get(session_id, ToolState()) if session_id else ToolState()

    # Check Google connection
    from integrations.workspace.adapters import _has_real_connection
    google_connected = await _has_real_connection(agent_id_str)
    log.info(f"[chat] agent={agent_id_str[:8]} google={google_connected}")

    # --- Tool routing ---
    tool_exec = await route_tools(agent_id_str, message, tool_state, google_connected)

    if tool_exec:
        log.info(f"[chat] tools fired: {tool_exec.tools_called}")
        if session_id:
            _tool_states[session_id] = tool_exec.state
        if tool_exec.clarification:
            return tool_exec.clarification

    # --- Build context ---
    history_block = ""
    if conversation_history:
        history_block = (
            "\n\nRecent conversation:\n"
            + "\n".join(conversation_history[-6:])
        )

    context_parts: list[str] = []

    # Knowledge entries
    kb_lines: list[str] = []
    for entry in (agent.knowledge_entries or []):
        topic = entry.get("topic", "?") if isinstance(entry, dict) else getattr(entry, "topic", "?")
        content = entry.get("content", "") if isinstance(entry, dict) else getattr(entry, "content", "")
        if content:
            kb_lines.append(f"- [{topic}] {content}")
    if agent.knowledge_base:
        kb_lines.append(f"- {agent.knowledge_base}")
    if agent.role_description:
        kb_lines.append(f"- About me: {agent.role_description}")
    kb_text = "\n".join(kb_lines).strip()
    if kb_text:
        context_parts.append(f"What I know about {agent.name}:\n{kb_text}")

    if tool_exec and tool_exec.context_for_llm:
        context_parts.append(tool_exec.context_for_llm)
    elif google_connected:
        # No tools fired — broad context for general questions
        try:
            google_block = await _hydrate_google_context(agent_id_str)
            if google_block:
                context_parts.append(google_block)
        except Exception:
            pass

    has_any_context = bool(context_parts)
    full_context = "\n\n".join(context_parts)

    source_hint = ""
    if tool_exec and tool_exec.source_labels:
        source_hint = (
            "\n\nIMPORTANT: End your answer with a source line, e.g.:\n"
            f"Source: {' · '.join(tool_exec.source_labels)}"
        )

    if has_any_context:
        system = (
            f"You are {agent.name}'s personal AI agent (called 'Your Raven').\n\n"
            f"{full_context}\n\n"
            f"Answer the user's question using ONLY the data above. Be specific — "
            f"name real files, emails, meetings, dates from the context. "
            f"NEVER invent facts. If the file content is provided, summarize it "
            f"thoroughly. If asked for action items, extract them from the content. "
            f"Keep answers focused and under 200 words."
            f"{source_hint}{history_block}"
        )
    else:
        system = (
            f"You are {agent.name}'s personal AI agent (called 'Your Raven'). "
            f"They just signed up — you don't yet have any data about their "
            f"work, team, calendar, or files.\n\n"
            f"Be a useful assistant: answer general questions, brainstorm, "
            f"reason through problems. NEVER invent facts about "
            f"{agent.name}'s specific work. If they ask about their files, "
            f"calendar, or emails, tell them to connect Google in Settings."
            f"{history_block}"
        )

    max_tokens = 800 if (tool_exec and "drive.read" in tool_exec.tools_called) else 400
    result = await call_llm(
        system=system,
        user_message=message,
        model_tier="reasoning",
        max_tokens=max_tokens,
    )
    if result:
        return result

    # LLM unavailable — data-aware fallback
    msg_lower = message.lower().strip()
    if any(g in msg_lower for g in ("hello", "hi", "hey", "good morning", "good afternoon")):
        if google_connected:
            return (
                "Hey! I can see your Google Calendar, Drive, and Gmail. "
                "Ask me about your meetings, files, or emails — I'm pulling from real data."
            )
        return (
            "Hey! Connect Google in Settings so I can read your calendar, "
            "drive, and inbox. Until then I can help with general questions."
        )
    if any(g in msg_lower for g in ("thank", "thanks", "appreciate")):
        return "You're welcome! Let me know if there's anything else."
    if any(g in msg_lower for g in ("bye", "goodbye", "see you")):
        return "Talk soon!"
    if google_connected:
        return (
            "I have your Google data loaded but my language model is "
            "temporarily unavailable. Try again in a moment."
        )
    return (
        "Google isn't connected yet. Connect in Settings → Google "
        "so I can read your files, calendar, and emails."
    )


@router.post("/", response_model=OrchestrateResponse)
async def orchestrate_endpoint(
    request: OrchestrateRequest,
    caller: AgentRow = Depends(get_current_agent),
):
    if request.agent_id != caller.id:
        raise HTTPException(status_code=403, detail="Cannot orchestrate as another agent")
    return await orchestrate(request)


async def orchestrate(request: OrchestrateRequest):
    """Full orchestration flow — classify, route via topic map, query agents, synthesize."""
    t_start = time.monotonic()
    trace_id = uuid4()
    session_id = _resolve_session_id(request.session_id)
    log.info(f"[{trace_id}] orchestrate start: {request.message[:80]!r} session={session_id[:8]}")

    source = await _get_agent(request.agent_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source agent not found")

    # Record the user message in the session
    _append_to_session(session_id, "user", request.message)

    # Build conversation context from session
    classify_history, synthesis_history = _build_conversation_context(
        session_id, request.conversation_history,
    )

    steps: list[OrchestrateStep] = []

    # Early exit for dismissive/acknowledgment messages — no need for LLM classify
    _clean = re.sub(r"[^\w\s]", " ", request.message.lower().strip()).split()
    if _clean and all(w in _DISMISS_WORDS for w in _clean):
        answer = await _conversational_fallback(source, request.message, [], session_id)
        _append_to_session(session_id, "assistant", answer)
        steps.append(OrchestrateStep(label="Acknowledged", detail="casual"))
        return OrchestrateResponse(
            intent="clarification",
            answer=answer,
            sources=[],
            steps=steps,
            trace_id=str(trace_id),
            session_id=session_id,
            source_agent=_agent_summary(source),
        )

    # Step 1: Load all agents and build topic map
    all_agents = await _get_all_agents(source.org_id)
    topic_map = build_topic_map(all_agents)
    available_keys = list(topic_map.keys())

    # Step 2: Combined classify + extract (single LLM call)
    t_classify = time.monotonic()
    result = await classify_and_extract(
        request.message, available_keys, classify_history
    )
    intent = result.get("intent", "information_query")
    topic = result.get("topic", "unknown")
    selected_keys = result.get("selected_keys", [])
    target_tier = result.get("target_tier", "mid")
    log.info(
        f"[{trace_id}] classify: {intent} topic={topic!r} "
        f"keys={selected_keys} tier={target_tier} "
        f"({time.monotonic() - t_classify:.2f}s)"
    )

    steps.append(OrchestrateStep(
        label="Understanding your question...",
        detail=f"{intent}: {topic}",
    ))

    # Step 3a: Handle acknowledgments ("thanks", "all good", "got it")
    if intent == "clarification" and result.get("_dismissive"):
        answer = (
            "You're welcome! Let me know if there's anything else you'd like "
            "to know about what's happening across the team."
        )
        _append_to_session(session_id, "assistant", answer)
        return OrchestrateResponse(
            intent="clarification",
            answer=answer,
            sources=[],
            steps=steps,
            trace_id=str(trace_id),
            session_id=session_id,
            source_agent=_agent_summary(source),
        )

    # Step 3b: Handle action_request (notification or doc sharing)
    if intent == "action_request":
        resp = await _handle_action_request(
            source, request.message, steps, trace_id
        )
        if resp is not None:
            # Record the assistant response in the session
            if resp.answer:
                _append_to_session(session_id, "assistant", resp.answer)
            resp.session_id = session_id
            return resp
        # _handle_action_request returned None — LLM misclassified, fall through
        # to information_query routing
        intent = "information_query"
        log.info(f"[{trace_id}] action_request found no match, falling through to info query")

    steps.append(OrchestrateStep(
        label="Identifying who knows about this...",
        detail=f"Topics: {', '.join(selected_keys) if selected_keys else 'none found'}",
    ))

    # Step 4: Rank agents (exclude source)
    ranked_ids = rank_agents(topic_map, selected_keys)
    ranked_ids = [aid for aid in ranked_ids if aid != str(source.id)]

    if not ranked_ids:
        log.info(f"[{trace_id}] no agents found for keys={selected_keys}")
        # Instead of a dead-end error, let the COO's agent respond directly
        # using the LLM with the agent's persona and knowledge base
        fallback_answer = await _conversational_fallback(
            source, request.message, synthesis_history, session_id
        )
        steps.append(OrchestrateStep(
            label="Responding directly",
            detail="No specialist routing needed",
        ))
        _append_to_session(session_id, "assistant", fallback_answer)
        return OrchestrateResponse(
            intent=intent,
            answer=fallback_answer,
            sources=[],
            steps=steps,
            trace_id=str(trace_id),
            session_id=session_id,
            source_agent=_agent_summary(source),
        )

    # Step 5: Fetch target agents
    target_agents = []
    for aid in ranked_ids[:6]:  # fetch more than 3 so seniority filter has options
        agent = await _get_agent(UUID(aid), source.org_id)
        if agent:
            target_agents.append(agent)

    # Step 5b: Tier-aware filter — keep only candidates at-or-below the
    # target_tier the classifier inferred. If only higher-tier agents
    # match, we still route but flag for confirmation so the UI can
    # gate the send (avoids a junior question silently paging the CEO).
    decision = filter_candidates(
        [(str(a.id), a.seniority) for a in target_agents],
        target_tier=target_tier,  # type: ignore[arg-type]
        requester_tier=source.seniority,  # type: ignore[arg-type]
        max_results=3,
    )
    chosen_set = set(decision.chosen_ids)
    target_agents = [a for a in target_agents if str(a.id) in chosen_set]
    log.info(
        f"[{trace_id}] seniority-filter: tier={target_tier} reason={decision.reason} "
        f"requires_confirmation={decision.requires_confirmation} "
        f"chosen={[a.name for a in target_agents]}"
    )
    if not target_agents:
        log.info(f"[{trace_id}] seniority-filter dropped all candidates")
        fallback_answer = await _conversational_fallback(
            source, request.message, synthesis_history, session_id
        )
        steps.append(OrchestrateStep(
            label="Responding directly",
            detail="No suitable specialist available",
        ))
        _append_to_session(session_id, "assistant", fallback_answer)
        return OrchestrateResponse(
            intent=intent,
            answer=fallback_answer,
            sources=[],
            steps=steps,
            trace_id=str(trace_id),
            session_id=session_id,
            source_agent=_agent_summary(source),
        )

    agent_names = [a.name for a in target_agents]
    consult_label = f"Consulting {', '.join(agent_names)}..."
    if decision.requires_confirmation:
        consult_label = (
            f"Escalating to {', '.join(agent_names)} (no lower-tier match)"
        )
    steps.append(OrchestrateStep(
        label=consult_label,
        detail=f"{len(target_agents)} agent(s) queried in parallel",
    ))

    # Step 6: Query agents in parallel
    t_query = time.monotonic()
    query_tasks = [
        query_agent_with_entries(
            agent, request.message, source.role, relevant_topics=selected_keys
        )
        for agent in target_agents
    ]
    results = await asyncio.gather(*query_tasks, return_exceptions=True)
    agent_responses = [r for r in results if isinstance(r, dict)]
    failed = [r for r in results if isinstance(r, Exception)]
    if failed:
        log.warning(f"[{trace_id}] {len(failed)} agent query failures: {failed}")
    log.info(
        f"[{trace_id}] queried {len(agent_responses)} agents "
        f"({time.monotonic() - t_query:.2f}s)"
    )

    # Step 7: Synthesize
    t_synth = time.monotonic()
    synthesized, source_roles, references = await synthesize_multi_agent_response(
        request.message, agent_responses, synthesis_history
    )
    log.info(f"[{trace_id}] synthesis done ({time.monotonic() - t_synth:.2f}s)")

    # Record the assistant response in the session
    _append_to_session(session_id, "assistant", synthesized)

    # Build rich source labels: "Name (Role)"
    source_labels = [
        f"{r['agent_name']} ({r['agent_role']})" for r in agent_responses
    ]

    steps.append(OrchestrateStep(
        label="Response ready",
        detail=f"Synthesized from {', '.join(source_labels)}",
    ))

    # Step 8: Check for second-hop references
    second_hop_available = False
    second_hop_agent_id = None
    second_hop_hint = None
    if references:
        queried_ids = {str(a.id) for a in target_agents}
        new_refs = [r for r in references if r != str(source.id) and r not in queried_ids]
        if new_refs:
            ref_agent = await _get_agent(UUID(new_refs[0]), source.org_id)
            if ref_agent:
                second_hop_available = True
                second_hop_agent_id = new_refs[0]
                second_hop_hint = _build_second_hop_hint(
                    ref_agent, topic, agent_responses
                )

    # Log activity
    await log_activity(ActivityEntry(
        org_id=source.org_id,
        type="route",
        from_agent=source.name,
        to_agent=", ".join(agent_names),
        description=f"Queried {len(target_agents)} agents about: {topic}",
    ))

    elapsed = time.monotonic() - t_start
    log.info(f"[{trace_id}] orchestrate complete ({elapsed:.2f}s total)")

    return OrchestrateResponse(
        intent=intent,
        answer=synthesized,
        sources=source_labels,
        second_hop_available=second_hop_available,
        second_hop_agent_id=second_hop_agent_id,
        second_hop_hint=second_hop_hint,
        steps=steps,
        trace_id=str(trace_id),
        session_id=session_id,
        source_agent=_agent_summary(source),
        target_agent=_agent_summary(target_agents[0]) if target_agents else None,
    )


async def _handle_action_request(
    source: Agent,
    message: str,
    steps: list[OrchestrateStep],
    trace_id: UUID,
) -> OrchestrateResponse:
    """Handle an action request — notification or document sharing with approval."""
    all_agents = await _get_all_agents(source.org_id)

    # FIX 1: Check for notification intent before document matching
    if _is_notification(message):
        target = _find_notification_target(
            [a for a in all_agents if a.id != source.id], message
        )
        if target:
            topic = _extract_notification_topic(message)
            steps.append(OrchestrateStep(
                label=f"Notifying {target.name}...",
                detail=f"{target.role} in {', '.join(target.departments)}",
            ))

            await log_activity(ActivityEntry(
                org_id=source.org_id,
                type="notification",
                from_agent=source.name,
                to_agent=target.name,
                description=f"Notification about {topic}",
            ))

            return OrchestrateResponse(
                intent="action_request",
                answer=(
                    f"Done — I've let {target.name} know about {topic}. "
                    f"They'll see it right away."
                ),
                sources=[target.role],
                steps=steps,
                trace_id=str(trace_id),
                source_agent=_agent_summary(source),
                target_agent=_agent_summary(target),
            )

    target_agent, doc = _find_document_match(all_agents, message)

    if not target_agent or not doc:
        # If the message doesn't contain explicit doc keywords, the LLM probably
        # misclassified — return None to let the caller fall through to info query
        if not _DOC_REQUEST_KW.search(message):
            return None

        # Genuinely asking for a doc but can't find it
        steps.append(OrchestrateStep(
            label="Looking for the requested document...",
            detail="Could not identify the exact document",
        ))
        return OrchestrateResponse(
            intent="action_request",
            answer=(
                "I couldn't pin down which document you mean — can you be a bit "
                "more specific? For example, the contract name or which team owns it."
            ),
            sources=[],
            steps=steps,
            trace_id=str(trace_id),
            source_agent=_agent_summary(source),
        )

    doc_name = doc.get("name", "") if isinstance(doc, dict) else doc.name
    doc_desc = doc.get("description", "") if isinstance(doc, dict) else doc.description
    requires_approval = (
        doc.get("requires_approval", True) if isinstance(doc, dict)
        else doc.requires_approval
    )

    steps.append(OrchestrateStep(
        label=f"Found document with {target_agent.name}...",
        detail=f"{doc_name}",
    ))

    if requires_approval or target_agent.trust_level == "approve":
        approval = ApprovalRequest(
            org_id=source.org_id,
            requesting_agent=source.id,
            owning_agent=target_agent.id,
            action="share_file",
            description=(
                f"{source.name} ({source.role}) is requesting: {doc_name}"
            ),
            resource=doc_name,
        )
        created = await create_approval_in_db(approval)

        # Notify via WebSocket
        await ws_manager.broadcast_to_agent(
            str(target_agent.id),
            {
                "type": "approval_request",
                "approval_id": str(created.id),
                "requester_name": source.name,
                "requester_role": source.role,
                "document_name": doc_name,
                "document_description": doc_desc,
            },
        )

        steps.append(OrchestrateStep(
            label=f"Approval request sent to {target_agent.name}",
            detail="Waiting for human approval",
        ))

        await log_activity(ActivityEntry(
            org_id=source.org_id,
            type="doc_request",
            from_agent=source.name,
            to_agent=target_agent.name,
            description=f"Requested document: {doc_name}",
        ))

        return OrchestrateResponse(
            intent="action_request",
            answer=None,
            sources=[target_agent.role],
            steps=steps,
            approval_id=created.id,
            trace_id=str(trace_id),
            source_agent=_agent_summary(source),
            target_agent=_agent_summary(target_agent),
        )

    # No approval needed — just confirm
    steps.append(OrchestrateStep(
        label="Document shared",
        detail=f"{doc_name} from {target_agent.name}",
    ))
    return OrchestrateResponse(
        intent="action_request",
        answer=f"{target_agent.name} has shared {doc_name}: {doc_desc}",
        sources=[target_agent.role],
        steps=steps,
        trace_id=str(trace_id),
        source_agent=_agent_summary(source),
        target_agent=_agent_summary(target_agent),
    )


@router.post("/second-hop", response_model=OrchestrateResponse)
async def second_hop(request: SecondHopRequest):
    """Query a referenced agent directly (second-hop chaining)."""
    source = await _get_agent(request.agent_id)
    if not source:
        raise HTTPException(status_code=404, detail="Agent not found")
    ref_agent = await _get_agent(request.referenced_agent_id, source.org_id)
    if not ref_agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    session_id = _resolve_session_id(request.session_id)
    steps: list[OrchestrateStep] = []
    trace_id = uuid4()

    question = request.follow_up or request.original_question

    # Record user follow-up in session
    _append_to_session(session_id, "user", question)

    # Use session history for synthesis context
    _, synthesis_history = _build_conversation_context(session_id, [request.original_question])

    steps.append(OrchestrateStep(
        label=f"Following up with {ref_agent.name}...",
        detail=f"{ref_agent.role} in {', '.join(ref_agent.departments)}",
    ))

    # Query the referenced agent
    response = await query_agent_with_entries(ref_agent, question, source.role)

    # Synthesize with conversation context
    synthesized, source_roles, refs = await synthesize_multi_agent_response(
        question, [response], conversation_history=synthesis_history
    )

    # Record assistant response in session
    _append_to_session(session_id, "assistant", synthesized)

    steps.append(OrchestrateStep(
        label="Response ready",
        detail=f"From {ref_agent.name}",
    ))

    await log_activity(ActivityEntry(
        org_id=source.org_id,
        type="route",
        from_agent=source.name,
        to_agent=ref_agent.name,
        description=f"Second-hop query to {ref_agent.role}",
    ))

    return OrchestrateResponse(
        intent="follow_up",
        answer=synthesized,
        sources=source_roles,
        steps=steps,
        trace_id=str(trace_id),
        session_id=session_id,
        source_agent=_agent_summary(source),
        target_agent=_agent_summary(ref_agent),
    )


@router.post("/stream")
async def orchestrate_stream_endpoint(
    request: OrchestrateRequest,
    caller: AgentRow = Depends(get_current_agent),
):
    if request.agent_id != caller.id:
        raise HTTPException(status_code=403, detail="Cannot orchestrate as another agent")
    return await orchestrate_stream(request)


async def orchestrate_stream(request: OrchestrateRequest):
    """Streaming orchestration — SSE stream with steps, chunks, sources, second_hop."""
    source = await _get_agent(request.agent_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source agent not found")

    session_id = _resolve_session_id(request.session_id)

    # Record the user message in the session
    _append_to_session(session_id, "user", request.message)

    # Build conversation context from session
    classify_history, synthesis_history = _build_conversation_context(
        session_id, request.conversation_history,
    )

    async def _generate() -> AsyncGenerator[str, None]:
        trace_id = uuid4()
        t_start = time.monotonic()
        log.info(
            f"[{trace_id}] stream start: {request.message[:80]!r} "
            f"session={session_id[:8]}"
        )

        # Emit the session_id so the frontend can track it
        yield _sse({"type": "session", "session_id": session_id})

        try:
            # Early exit for dismissive messages
            _clean_s = re.sub(r"[^\w\s]", " ", request.message.lower().strip()).split()
            if _clean_s and all(w in _DISMISS_WORDS for w in _clean_s):
                answer = await _conversational_fallback(source, request.message, [], session_id)
                yield _sse({"type": "chunk", "text": answer})
                _append_to_session(session_id, "assistant", answer)
                yield _sse({"type": "done", "trace_id": str(trace_id)})
                return

            # Step 0a: Tool routing — if the message triggers Drive/file
            # tools, handle it directly without classify/route overhead.
            from integrations.workspace.adapters import _has_real_connection
            from tools.router import ToolState, route_tools

            tool_state = _tool_states.get(session_id, ToolState())
            google_ok = await _has_real_connection(str(source.id))
            tool_exec = await route_tools(str(source.id), request.message, tool_state, google_ok)

            if tool_exec:
                log.info(f"[{trace_id}] tools fired early: {tool_exec.tools_called}")
                _tool_states[session_id] = tool_exec.state

                if tool_exec.clarification:
                    yield _sse({"type": "step", "step": {
                        "label": "Checked your connected data",
                        "status": "done", "detail": "Google not connected",
                    }})
                    yield _sse({"type": "chunk", "text": tool_exec.clarification})
                    _append_to_session(session_id, "assistant", tool_exec.clarification)
                    yield _sse({"type": "done", "trace_id": str(trace_id)})
                    return

                yield _sse({"type": "step", "step": {
                    "label": "Searching your files...",
                    "status": "done",
                    "detail": ", ".join(tool_exec.tools_called),
                }})

                from agents.llm_providers import call_llm

                source_hint = ""
                if tool_exec.source_labels:
                    source_hint = (
                        "\n\nEnd your answer with:\n"
                        f"Source: {' · '.join(tool_exec.source_labels)}"
                    )
                system = (
                    f"You are {source.name}'s personal AI agent (called 'Your Raven').\n\n"
                    f"{tool_exec.context_for_llm}\n\n"
                    f"Answer the user's question using ONLY the data above. "
                    f"Be specific, cite file names and dates. "
                    f"If file content is provided, summarize thoroughly. "
                    f"If asked for action items, extract them. "
                    f"If asked to download or open a file, provide the Google Drive link if available. "
                    f"NEVER invent facts."
                    f"{source_hint}"
                )
                max_tok = 800 if "drive.read" in tool_exec.tools_called else 400
                answer = await call_llm(
                    system=system, user_message=request.message,
                    model_tier="reasoning", max_tokens=max_tok,
                )
                if not answer:
                    answer = (
                        "I found your files but my language model is temporarily "
                        "unavailable. Try again in a moment."
                    )
                yield _sse({"type": "sources", "sources": tool_exec.source_labels})
                yield _sse({"type": "chunk", "text": answer})
                _append_to_session(session_id, "assistant", answer)
                yield _sse({"type": "done", "trace_id": str(trace_id)})
                return

            # Step 0b: Check personal data (meetings, tasks)
            from meetings.context import build_personal_context, has_personal_data

            personal_context = ""
            has_my_data = await has_personal_data(request.agent_id)
            if has_my_data:
                personal_context = await build_personal_context(request.agent_id)
                log.info(f"[{trace_id}] loaded personal context ({len(personal_context)} chars)")

            # Try to answer from personal data first (if relevant)
            if personal_context and _is_personal_question(request.message):
                yield _sse({"type": "step", "step": {
                    "label": "Checking your data...",
                    "status": "done",
                    "detail": "Looking at your meetings and tasks",
                }})

                personal_answer = await _answer_from_personal_data(
                    source, request.message, personal_context, synthesis_history,
                )
                if personal_answer:
                    yield _sse({"type": "step", "step": {
                        "label": "Answered from your data",
                        "status": "done",
                        "detail": "No need to ask other agents",
                    }})
                    yield _sse({"type": "sources", "sources": ["Your meetings & tasks"]})
                    yield _sse({"type": "chunk", "text": personal_answer})
                    _append_to_session(session_id, "assistant", personal_answer)
                    yield _sse({"type": "done", "trace_id": str(trace_id)})
                    return

            # Step 1: Load agents + build topic map
            all_agents = await _get_all_agents(source.org_id)
            topic_map = build_topic_map(all_agents)
            available_keys = list(topic_map.keys())

            # Step 2: Combined classify + extract (single LLM call)
            t_classify = time.monotonic()
            result = await classify_and_extract(
                request.message, available_keys, classify_history
            )
            intent = result.get("intent", "information_query")
            topic = result.get("topic", "unknown")
            selected_keys = result.get("selected_keys", [])
            target_tier = result.get("target_tier", "mid")
            log.info(
                f"[{trace_id}] classify: {intent} topic={topic!r} "
                f"keys={selected_keys} tier={target_tier} "
                f"({time.monotonic() - t_classify:.2f}s)"
            )

            yield _sse({"type": "step", "step": {
                "label": "Understanding your question...",
                "status": "done",
                "detail": f"{intent}: {topic}",
            }})

            # Handle acknowledgments ("thanks", "all good")
            if intent == "clarification" and result.get("_dismissive"):
                answer = (
                    "You're welcome! Let me know if there's anything else you'd "
                    "like to know about what's happening across the team."
                )
                yield _sse({"type": "chunk", "text": answer})
                _append_to_session(session_id, "assistant", answer)
                yield _sse({"type": "done", "trace_id": str(trace_id)})
                return

            # Handle action_request
            if intent == "action_request":
                resp = await _handle_action_request(
                    source, request.message, [], trace_id
                )
                if resp is not None:
                    for step in resp.steps:
                        yield _sse({"type": "step", "step": step.model_dump()})
                    if resp.answer:
                        yield _sse({"type": "chunk", "text": resp.answer})
                        _append_to_session(session_id, "assistant", resp.answer)
                    if resp.approval_id:
                        yield _sse({
                            "type": "approval",
                            "approval_id": str(resp.approval_id),
                            "target_name": (
                                resp.target_agent.get("name", "") if resp.target_agent else ""
                            ),
                            "target_role": (
                                resp.target_agent.get("role", "") if resp.target_agent else ""
                            ),
                        })
                    yield _sse({"type": "done", "trace_id": str(trace_id)})
                    return
                # Misclassified — fall through to info query
                intent = "information_query"

            yield _sse({"type": "step", "step": {
                "label": "Searching across your organization...",
                "status": "done",
                "detail": (
                    f"Topics: {', '.join(selected_keys)}" if selected_keys
                    else "Scanning all teams"
                ),
            }})

            # Step 3: Rank agents
            ranked_ids = rank_agents(topic_map, selected_keys)
            ranked_ids = [aid for aid in ranked_ids if aid != str(source.id)]

            if not ranked_ids:
                fallback = await _conversational_fallback(
                    source, request.message, synthesis_history, session_id
                )
                yield _sse({"type": "chunk", "text": fallback})
                _append_to_session(session_id, "assistant", fallback)
                yield _sse({"type": "done", "trace_id": str(trace_id)})
                return

            # Step 4: Fetch candidates (over-fetch for the seniority filter)
            target_agents = []
            for aid in ranked_ids[:6]:
                agent = await _get_agent(UUID(aid), source.org_id)
                if agent:
                    target_agents.append(agent)

            # Tier-aware filter — see comment on the non-streaming path.
            decision = filter_candidates(
                [(str(a.id), a.seniority) for a in target_agents],
                target_tier=target_tier,  # type: ignore[arg-type]
                requester_tier=source.seniority,  # type: ignore[arg-type]
                max_results=3,
            )
            chosen_set = set(decision.chosen_ids)
            target_agents = [a for a in target_agents if str(a.id) in chosen_set]
            log.info(
                f"[{trace_id}] seniority-filter: tier={target_tier} reason={decision.reason} "
                f"requires_confirmation={decision.requires_confirmation} "
                f"chosen={[a.name for a in target_agents]}"
            )
            if not target_agents:
                fallback = await _conversational_fallback(
                    source, request.message, synthesis_history, session_id
                )
                yield _sse({"type": "chunk", "text": fallback})
                _append_to_session(session_id, "assistant", fallback)
                yield _sse({"type": "done", "trace_id": str(trace_id)})
                return

            agent_names = [a.name for a in target_agents]
            consult_label = f"Consulting {', '.join(agent_names)}..."
            if decision.requires_confirmation:
                consult_label = (
                    f"Escalating to {', '.join(agent_names)} (no lower-tier match)"
                )
            yield _sse({"type": "step", "step": {
                "label": consult_label,
                "status": "done",
                "detail": (
                    f"Querying {len(target_agents)} "
                    f"team member{'s' if len(target_agents) > 1 else ''}"
                ),
            }})

            # Query in parallel
            t_query = time.monotonic()
            query_tasks = [
                query_agent_with_entries(
                    agent, request.message, source.role, relevant_topics=selected_keys
                )
                for agent in target_agents
            ]
            results = await asyncio.gather(*query_tasks, return_exceptions=True)
            agent_responses = [r for r in results if isinstance(r, dict)]
            failed = [r for r in results if isinstance(r, Exception)]
            if failed:
                log.warning(f"[{trace_id}] {len(failed)} agent query failures: {failed}")
            log.info(
                f"[{trace_id}] queried {len(agent_responses)} agents "
                f"({time.monotonic() - t_query:.2f}s)"
            )

            if not agent_responses:
                no_response = (
                    "I reached out to the team but wasn't able to get a response. "
                    "Let me try again — could you rephrase your question?"
                )
                yield _sse({"type": "chunk", "text": no_response})
                _append_to_session(session_id, "assistant", no_response)
                yield _sse({"type": "done", "trace_id": str(trace_id)})
                return

            # Step 5: Stream synthesis
            yield _sse({"type": "step", "step": {
                "label": "Putting it together...",
                "status": "done",
                "detail": "",
            }})

            t_synth = time.monotonic()
            full_text = ""
            async for chunk in stream_synthesis(
                request.message, agent_responses, synthesis_history
            ):
                full_text += chunk
                yield _sse({"type": "chunk", "text": chunk})
            log.info(f"[{trace_id}] synthesis streamed ({time.monotonic() - t_synth:.2f}s)")

            # Record the full assistant response in the session
            _append_to_session(session_id, "assistant", full_text)

            # Emit rich sources: "Name (Role)"
            source_labels = [
                f"{r['agent_name']} ({r['agent_role']})" for r in agent_responses
            ]
            yield _sse({"type": "sources", "sources": source_labels})

            # Check for second-hop
            all_refs = []
            for r in agent_responses:
                all_refs.extend(r.get("references", []))

            queried_ids = {str(a.id) for a in target_agents}
            new_refs = [
                r for r in set(all_refs)
                if r != str(source.id) and r not in queried_ids
            ]
            if new_refs:
                ref_agent = await _get_agent(UUID(new_refs[0]), source.org_id)
                if ref_agent:
                    yield _sse({
                        "type": "second_hop",
                        "available": True,
                        "agent_id": new_refs[0],
                        "hint": _build_second_hop_hint(
                            ref_agent, topic, agent_responses
                        ),
                    })

            # Log activity
            await log_activity(ActivityEntry(
                org_id=source.org_id,
                type="route",
                from_agent=source.name,
                to_agent=", ".join(agent_names),
                description=f"Queried {len(target_agents)} agents about: {topic}",
            ))

            elapsed = time.monotonic() - t_start
            log.info(f"[{trace_id}] stream complete ({elapsed:.2f}s total)")
            yield _sse({"type": "done", "trace_id": str(trace_id)})

        except Exception as exc:
            log.exception(f"[{trace_id}] stream error: {exc}")
            yield _sse({
                "type": "error",
                "message": (
                    "Something went wrong while processing your request. "
                    "Please try again."
                ),
            })
            yield _sse({"type": "done", "trace_id": str(trace_id)})

    return StreamingResponse(_generate(), media_type="text/event-stream")


@router.post("/second-hop/stream")
async def second_hop_stream(request: SecondHopRequest):
    """Streaming second-hop query."""
    source = await _get_agent(request.agent_id)
    if not source:
        raise HTTPException(status_code=404, detail="Agent not found")
    ref_agent = await _get_agent(request.referenced_agent_id, source.org_id)
    if not ref_agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    session_id = _resolve_session_id(request.session_id)

    async def _generate() -> AsyncGenerator[str, None]:
        trace_id = uuid4()
        t_start = time.monotonic()
        log.info(f"[{trace_id}] second-hop start: {ref_agent.name}")

        try:
            question = request.follow_up or request.original_question

            # Record user follow-up in session
            _append_to_session(session_id, "user", question)

            # Use session history for synthesis context
            _, synthesis_history = _build_conversation_context(
                session_id, [request.original_question],
            )

            yield _sse({"type": "session", "session_id": session_id})

            yield _sse({"type": "step", "step": {
                "label": f"Reaching out to {ref_agent.name}...",
                "status": "done",
                "detail": f"{ref_agent.role} in {', '.join(ref_agent.departments)}",
            }})

            response = await query_agent_with_entries(ref_agent, question, source.role)

            yield _sse({"type": "step", "step": {
                "label": "Putting it together...",
                "status": "done",
                "detail": "",
            }})

            full_text = ""
            async for chunk in stream_synthesis(
                question, [response],
                conversation_history=synthesis_history,
            ):
                full_text += chunk
                yield _sse({"type": "chunk", "text": chunk})

            # Record assistant response in session
            _append_to_session(session_id, "assistant", full_text)

            yield _sse({"type": "sources", "sources": [
                f"{ref_agent.name} ({ref_agent.role})"
            ]})

            await log_activity(ActivityEntry(
                org_id=source.org_id,
                type="route",
                from_agent=source.name,
                to_agent=ref_agent.name,
                description=f"Second-hop query to {ref_agent.role}",
            ))

            log.info(
                f"[{trace_id}] second-hop complete ({time.monotonic() - t_start:.2f}s)"
            )
            yield _sse({"type": "done", "trace_id": str(trace_id)})

        except Exception as exc:
            log.exception(f"[{trace_id}] second-hop error: {exc}")
            yield _sse({
                "type": "error",
                "message": "Something went wrong following up. Please try again.",
            })
            yield _sse({"type": "done", "trace_id": str(trace_id)})

    return StreamingResponse(_generate(), media_type="text/event-stream")


@router.get("/approval/{approval_id}/complete", response_model=OrchestrateResponse)
async def complete_doc_request(approval_id: UUID):
    """After approval is granted, complete the doc request."""
    async with db.async_session() as session:
        approval_row = await session.get(ApprovalRow, approval_id)

    if not approval_row:
        raise HTTPException(status_code=404, detail="Approval not found")

    source = await _get_agent(approval_row.requesting_agent, approval_row.org_id)
    target = await _get_agent(approval_row.owning_agent, approval_row.org_id)
    if not source or not target:
        raise HTTPException(status_code=404, detail="Agent not found")

    if approval_row.status == "pending":
        return OrchestrateResponse(
            intent="action_request",
            steps=[OrchestrateStep(label="Waiting for approval...", status="pending")],
            answer=None,
            approval_id=approval_id,
            source_agent=_agent_summary(source),
            target_agent=_agent_summary(target),
        )

    if approval_row.status == "denied":
        return OrchestrateResponse(
            intent="action_request",
            steps=[OrchestrateStep(label="Request denied", detail="Access was denied")],
            answer=(
                f"{target.name} declined the request. This might be a sensitivity "
                f"or timing issue — want me to follow up with them for context?"
            ),
            approval_id=approval_id,
            source_agent=_agent_summary(source),
            target_agent=_agent_summary(target),
        )

    # Approved
    doc_name = approval_row.resource
    # Make the filename human-readable
    readable_name = doc_name.replace("_", " ").rsplit(".", 1)[0]

    await log_activity(ActivityEntry(
        org_id=source.org_id,
        type="approval",
        from_agent=target.name,
        description=f"Approved document share to {source.name}: {doc_name}",
    ))

    return OrchestrateResponse(
        intent="action_request",
        steps=[
            OrchestrateStep(label="Approval granted", detail=f"{target.name} approved"),
            OrchestrateStep(label="Document shared"),
        ],
        answer=(
            f"Done — {target.name} approved the share. The {readable_name} "
            f"is now available to you. Let me know if you need anything else "
            f"from {', '.join(target.departments)}."
        ),
        approval_id=approval_id,
        source_agent=_agent_summary(source),
        target_agent=_agent_summary(target),
    )


@router.post("/reset")
async def reset_demo():
    """Clear all demo state — approvals, activity, message ledger, sessions. Reseed agents."""
    log.info("[reset] clearing all demo state")

    async with db.async_session() as session:
        await session.execute(ApprovalRow.__table__.delete())
        await session.execute(ActivityRow.__table__.delete())
        await session.execute(MessageLedgerRow.__table__.delete())
        await session.commit()

    # Clear all conversation sessions
    _conversation_sessions.clear()

    # Close all WebSocket connections so approval screen reconnects clean
    await ws_manager.close_all()

    # Note: demo agents are no longer reseeded — real customers don't
    # have placeholder personas in their workspace.

    log.info("[reset] state reset complete")
    return {"status": "ok", "message": "State reset"}


def _build_second_hop_hint(
    ref_agent: Agent, topic: str, agent_responses: list[dict]
) -> str:
    """Build a context-aware second-hop suggestion based on the topic and agent responses."""
    dept = ref_agent.departments[0] if ref_agent.departments else "their team"

    # Scan agent responses for clues about what the referenced agent knows
    clues = []
    for r in agent_responses:
        content_lower = r["content"].lower()
        if "vendor" in content_lower or "stripe" in content_lower:
            clues.append("vendor status")
        if (
            "timeline" in content_lower
            or "delivery" in content_lower
            or "deadline" in content_lower
        ):
            clues.append("the latest timeline")
        if "blocker" in content_lower or "blocked" in content_lower:
            clues.append("the blocker status")
        if "support" in content_lower or "ticket" in content_lower:
            clues.append("the support situation")
        if "onboarding" in content_lower or "seller" in content_lower:
            clues.append("the onboarding details")
        if "compliance" in content_lower or "kyc" in content_lower:
            clues.append("the compliance update")

    # Deduplicate and pick the most relevant clue
    seen = set()
    unique_clues = []
    for c in clues:
        if c not in seen:
            seen.add(c)
            unique_clues.append(c)

    if unique_clues:
        subject = unique_clues[0]
    else:
        subject = f"more details on {topic}" if topic != "unknown" else "more details"

    return f"Want me to check with {ref_agent.name} in {dept} about {subject}?"


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"


def _agent_summary(agent: Agent) -> dict:
    return {
        "id": str(agent.id),
        "name": agent.name,
        "role": agent.role,
        "departments": agent.departments,
    }
