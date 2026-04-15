"""Comprehensive audit logging — tracks every agent action.

Every significant action gets logged:
- Meeting processed, task extracted
- Agent-to-agent query (who asked who, what was shared)
- Permission check (allowed/denied, what scopes were checked)
- Data access (who accessed what data, when)
- Document sharing (request, approval, delivery)
- Encryption events (encrypt/decrypt operations)

Logs go to the activity table (visible in the dashboard) and to
structured Python logging (exportable to external systems).
"""

import logging
import uuid
from datetime import datetime, timezone

import db
from db import ActivityRow

log = logging.getLogger("security.audit")


async def log_audit(
    event_type: str,
    agent_id: str | None = None,
    agent_name: str = "",
    target_agent_id: str | None = None,
    target_agent_name: str = "",
    action: str = "",
    resource: str = "",
    result: str = "success",
    detail: str = "",
    permission_context: dict | None = None,
) -> None:
    """Log an audit event to both the database and structured logging.

    Event types:
    - meeting_processed: meeting transcript ingested and tasks extracted
    - task_extracted: individual task created from meeting
    - agent_query: one agent queried another
    - permission_check: permission was evaluated (allowed/denied)
    - data_access: data was read from the database
    - document_request: document sharing was requested
    - document_approved: document sharing was approved
    - document_denied: document sharing was denied
    - encryption_op: data was encrypted or decrypted
    - login: user signed in
    - llm_call: data was sent to an external LLM
    """
    # Structured log for external consumption
    log_entry = {
        "event": event_type,
        "agent_id": agent_id,
        "agent_name": agent_name,
        "target_agent_id": target_agent_id,
        "target_agent_name": target_agent_name,
        "action": action,
        "resource": resource,
        "result": result,
        "detail": detail,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if permission_context:
        log_entry["permissions"] = permission_context

    log.info(f"AUDIT: {log_entry}")

    # Persist to database
    description = _build_description(event_type, agent_name, target_agent_name, action, resource, result, detail)

    try:
        async with db.async_session() as session:
            session.add(ActivityRow(
                id=uuid.uuid4(),
                type=f"audit:{event_type}",
                from_agent=agent_name or agent_id or "system",
                to_agent=target_agent_name or target_agent_id,
                description=description,
                created_at=datetime.now(timezone.utc),
            ))
            await session.commit()
    except Exception as e:
        # Audit logging should never crash the app
        log.error(f"Failed to persist audit log: {e}")


def _build_description(
    event_type: str,
    agent_name: str,
    target_name: str,
    action: str,
    resource: str,
    result: str,
    detail: str,
) -> str:
    """Build a human-readable description for the activity feed."""
    if event_type == "meeting_processed":
        return f"Meeting processed — {detail}"
    if event_type == "task_extracted":
        return f"Task extracted: {resource}"
    if event_type == "agent_query":
        return f"{agent_name}'s agent queried {target_name}'s agent — {action}"
    if event_type == "permission_check":
        status = "allowed" if result == "success" else "denied"
        return f"Permission {status}: {agent_name} → {target_name} ({action})"
    if event_type == "document_request":
        return f"{agent_name} requested document from {target_name}: {resource}"
    if event_type == "document_approved":
        return f"{target_name} approved document access for {agent_name}: {resource}"
    if event_type == "document_denied":
        return f"{target_name} denied document access for {agent_name}: {resource}"
    if event_type == "data_access":
        return f"{agent_name} accessed {resource}"
    if event_type == "login":
        return f"{agent_name} signed in"
    if event_type == "llm_call":
        return f"LLM call: {action} ({detail})"
    return detail or f"{event_type}: {action}"
