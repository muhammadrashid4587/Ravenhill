"""Agent-powered surfaces over Google Workspace data.

Two entry points used by the home page:

- `triage_inbox(agent_id)` — ranks Gmail threads and picks the top three,
  with a one-line reason + urgency tag. Uses the LLM if available; falls
  back to a deterministic heuristic when it isn't.
- `build_pre_meeting_brief(agent_id, event_id)` — for a calendar event,
  pulls recent inbox context that mentions the attendees and asks the
  LLM for a 3-bullet brief. Falls back to a safe deterministic brief.

Both functions return dicts shaped for direct use by the frontend.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from agents.llm_providers import call_llm, call_llm_structured
from integrations.workspace.adapters import (
    list_calendar_events,
    list_gmail_threads,
)

log = logging.getLogger("integrations.workspace.surfaces")


# ---------------------------------------------------------------------------
# Inbox triage
# ---------------------------------------------------------------------------


_TRIAGE_SYSTEM = (
    "You are the user's personal work agent. You triage their inbox. "
    "Given recent threads, pick the three that most need the user's "
    "attention and explain each in one short sentence.\n\n"
    "Rules:\n"
    "- Prefer unread threads, or threads that clearly ask the user a "
    "question or for a decision.\n"
    "- Skip newsletters, automated notifications, and receipts unless "
    "they need action.\n"
    "- Urgency must be exactly 'now', 'today', or 'this_week'.\n"
    "- 'reason' is ONE plain-English sentence, max 15 words, no hedging. "
    "Never leave it blank.\n"
    "- thread_id must be the exact id= value from the input.\n"
    "- subject must be the exact subject from the input.\n"
    "- from must be the exact from= value from the input.\n\n"
    "Return JSON in exactly this shape (fill every field with real "
    "content — never return empty strings):\n"
    '{"items":[{"thread_id":"<id>","subject":"<subject>",'
    '"from":"<from>","urgency":"today","reason":"<one-sentence why>"}]}\n\n'
    "Example of a good reason: \"Max pushed the deadline — confirm the "
    "new date before the SLS kickoff call.\""
)


_TRIAGE_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "thread_id": {"type": "string"},
                    "subject": {"type": "string"},
                    "from": {"type": "string"},
                    "urgency": {
                        "type": "string",
                        "enum": ["now", "today", "this_week"],
                    },
                    "reason": {"type": "string"},
                },
                "required": ["thread_id", "subject", "urgency", "reason"],
            },
            "minItems": 0,
            "maxItems": 3,
        }
    },
    "required": ["items"],
}


def _summarize_threads_for_llm(threads: list[dict[str, Any]]) -> str:
    lines = []
    for t in threads[:10]:
        lines.append(
            f"- id={t.get('id')} | from={t.get('from') or '?'} | "
            f"unread={t.get('unread', False)} | "
            f"subject={t.get('subject', '')} | "
            f"preview={(t.get('snippet') or '')[:160]}"
        )
    return "\n".join(lines) if lines else "(inbox empty)"


def _heuristic_triage(threads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deterministic fallback when the LLM isn't available. Prioritizes
    unread, then recency. Reason text is generic but still useful."""
    ranked = sorted(
        threads,
        key=lambda t: (
            0 if t.get("unread") else 1,
            t.get("received_at") or "",
        ),
        reverse=False,
    )
    # Reverse on received_at so unread-then-newest wins.
    ranked = sorted(
        threads,
        key=lambda t: (
            0 if t.get("unread") else 1,
            -(_received_ts(t.get("received_at") or "")),
        ),
    )
    out: list[dict[str, Any]] = []
    for t in ranked[:3]:
        urgency = "today" if t.get("unread") else "this_week"
        reason = (
            "Unread and waiting on you."
            if t.get("unread")
            else "Recent — worth a second look."
        )
        out.append(
            {
                "thread_id": t.get("id", ""),
                "subject": t.get("subject", "(no subject)"),
                "from": t.get("from", ""),
                "urgency": urgency,
                "reason": reason,
                "thread_url": t.get("thread_url"),
            }
        )
    return out


def _received_ts(s: str) -> float:
    if not s:
        return 0.0
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except ValueError:
        try:
            from email.utils import parsedate_to_datetime

            return parsedate_to_datetime(s).timestamp()
        except (TypeError, ValueError):
            return 0.0


async def triage_inbox(agent_id: str) -> dict[str, Any]:
    threads = await list_gmail_threads(agent_id, limit=15)

    if not threads:
        return {"agent_id": agent_id, "items": [], "source": "empty"}

    # Ask the LLM.
    user_msg = (
        "Here are the user's 10 most recent inbox threads. Pick the 3 "
        "that most need attention and return JSON per the schema.\n\n"
        f"{_summarize_threads_for_llm(threads)}"
    )
    # Use the reasoning tier — the fast 8B model returned empty items.
    result = await call_llm_structured(
        _TRIAGE_SYSTEM,
        user_msg,
        _TRIAGE_SCHEMA,
        model_tier="reasoning",
        max_tokens=900,
    )

    if isinstance(result, dict) and isinstance(result.get("items"), list):
        by_id = {t.get("id"): t for t in threads}
        items: list[dict[str, Any]] = []
        for it in result["items"][:3]:
            # Skip skeleton responses where the model filled in nothing —
            # they're worse than the heuristic.
            reason = (it.get("reason") or "").strip()
            tid = it.get("thread_id")
            if not reason or not tid:
                continue
            src = by_id.get(tid) or {}
            items.append(
                {
                    "thread_id": tid,
                    "subject": (it.get("subject") or src.get("subject", "")).strip(),
                    "from": (it.get("from") or src.get("from", "")).strip(),
                    "urgency": it.get("urgency", "today"),
                    "reason": reason,
                    "thread_url": src.get("thread_url"),
                }
            )
        if items:
            return {"agent_id": agent_id, "items": items, "source": "llm"}
        log.info("[triage] LLM returned empty items, using heuristic")

    return {
        "agent_id": agent_id,
        "items": _heuristic_triage(threads),
        "source": "heuristic",
    }


# ---------------------------------------------------------------------------
# Pre-meeting brief
# ---------------------------------------------------------------------------


_BRIEF_SYSTEM = (
    "You are the user's personal work agent. You write short pre-meeting "
    "briefs. Input: a calendar event and recent inbox threads that mention "
    "the attendees.\n\n"
    "Write exactly 3 bullets:\n"
    "1. Context — what this meeting is about and why it's on the calendar.\n"
    "2. What's at stake — the decision, risk, or deliverable on the line.\n"
    "3. Suggested opening — one concrete sentence the user could say to "
    "start.\n\n"
    "Each bullet: max 28 words, no hedging, no disclaimers. Plain text, "
    "no markdown prefixes."
)


def _extract_email_local(addr: str) -> str:
    # "Max Park <max@e-agent.ai>" → "max"
    if not addr:
        return ""
    if "<" in addr and ">" in addr:
        addr = addr.split("<", 1)[1].rsplit(">", 1)[0]
    return addr.split("@", 1)[0].lower()


def _relevant_threads(
    threads: list[dict[str, Any]], attendees: list[str]
) -> list[dict[str, Any]]:
    locals_set = {_extract_email_local(a) for a in attendees if a}
    locals_set.discard("")
    relevant: list[dict[str, Any]] = []
    for t in threads:
        sender_local = _extract_email_local(t.get("from") or "")
        hit = sender_local in locals_set
        if not hit:
            # Also consider subject/snippet mentions.
            haystack = (
                (t.get("subject") or "") + " " + (t.get("snippet") or "")
            ).lower()
            for local in locals_set:
                if local and local in haystack:
                    hit = True
                    break
        if hit:
            relevant.append(t)
    return relevant[:6]


def _format_threads_for_brief(threads: list[dict[str, Any]]) -> str:
    if not threads:
        return "(no recent inbox threads with the attendees)"
    lines = []
    for t in threads:
        lines.append(
            f"- [{t.get('from', '?')}] {t.get('subject', '(no subject)')}: "
            f"{(t.get('snippet') or '')[:180]}"
        )
    return "\n".join(lines)


def _find_event(
    events: list[dict[str, Any]], event_id: str
) -> dict[str, Any] | None:
    for e in events:
        if e.get("id") == event_id:
            return e
    return None


async def build_pre_meeting_brief(agent_id: str, event_id: str) -> dict[str, Any]:
    events = await list_calendar_events(agent_id)
    event = _find_event(events, event_id)
    if event is None:
        raise LookupError(event_id)

    threads = await list_gmail_threads(agent_id, limit=25)
    relevant = _relevant_threads(threads, event.get("attendees") or [])

    user_msg = (
        f"Event: {event.get('title', 'Untitled')}\n"
        f"Start: {event.get('start_time')}\n"
        f"Attendees: {', '.join(event.get('attendees') or []) or '(none listed)'}\n"
        f"Meeting URL: {event.get('meeting_url') or '(none)'}\n\n"
        f"Recent inbox threads involving the attendees:\n"
        f"{_format_threads_for_brief(relevant)}\n\n"
        "Write the 3-bullet brief now."
    )

    text = await call_llm(
        _BRIEF_SYSTEM,
        user_msg,
        model_tier="reasoning",
        max_tokens=450,
    )

    bullets: list[str]
    if text:
        bullets = _extract_bullets(text)
        source = "llm"
    else:
        bullets = _fallback_bullets(event, relevant)
        source = "heuristic"

    return {
        "event": {
            "id": event.get("id"),
            "title": event.get("title"),
            "start_time": event.get("start_time"),
            "attendees": event.get("attendees") or [],
            "meeting_url": event.get("meeting_url"),
        },
        "bullets": bullets,
        "related_threads": [
            {
                "id": t.get("id"),
                "subject": t.get("subject"),
                "from": t.get("from"),
                "thread_url": t.get("thread_url"),
            }
            for t in relevant[:4]
        ],
        "source": source,
    }


def _extract_bullets(text: str) -> list[str]:
    """Parse a model response that may have '1.' / '-' / '*' prefixes."""
    out: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        for pref in ("1.", "2.", "3.", "-", "*", "•"):
            if line.startswith(pref):
                line = line[len(pref):].strip()
                break
        # Strip "Context — " / "What's at stake — " / "Suggested opening — "
        # if the model kept them as labels — we want the substance.
        if " — " in line[:30]:
            line = line.split(" — ", 1)[1].strip()
        if " - " in line[:30]:
            line = line.split(" - ", 1)[1].strip()
        if line:
            out.append(line)
        if len(out) == 3:
            break
    if out:
        return out
    # Last resort — just split on newlines.
    return [
        ln.strip() for ln in text.splitlines() if ln.strip()
    ][:3]


def _fallback_bullets(
    event: dict[str, Any], relevant: list[dict[str, Any]]
) -> list[str]:
    title = event.get("title") or "This meeting"
    attendees = event.get("attendees") or []
    names = [_extract_email_local(a).replace(".", " ").title() for a in attendees[:3]]
    with_whom = ", ".join(names) if names else "the team"

    if relevant:
        subjects = "; ".join(
            (t.get("subject") or "").strip() for t in relevant[:2] if t.get("subject")
        )
        context = (
            f"{title} with {with_whom}. Recent threads in play: {subjects}."
        )
    else:
        context = f"{title} with {with_whom}. No recent inbox context."

    stakes = (
        "Decision or next-step likely needed — lock owners and the date "
        "before you leave the call."
    )
    opening = (
        f"Start with: What's the single outcome we need from this "
        f"{title.split()[0].lower()}?"
    )
    return [context, stakes, opening]


__all__ = ["triage_inbox", "build_pre_meeting_brief"]


def _maybe_parse_json(text: str) -> dict | None:
    """Some providers return JSON as a plain string — try to parse."""
    if not text:
        return None
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        return None
