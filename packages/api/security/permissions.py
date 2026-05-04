"""Agent permission scoping — controls what data agents can share with each other.

When agent A asks agent B a question, B doesn't share everything it knows.
B checks what A is allowed to see based on:
1. A's scopes (what categories of data A can access)
2. The knowledge entry's visibility ("public" = anyone, "team" = same department)
3. Document sensitivity level

This is the "who can talk to who about what" layer.
"""

import logging

from agents.models import Agent

log = logging.getLogger("security.permissions")


# Scope definitions — what each scope grants access to
SCOPE_GRANTS = {
    "read:public": {"visibility": ["public"]},
    "read:team": {"visibility": ["public", "team"]},
    "read:confidential": {"visibility": ["public", "team", "confidential"]},
    "read:all": {"visibility": ["public", "team", "confidential", "restricted"]},
    "write:own": {"actions": ["update_own"]},
    "write:team": {"actions": ["update_own", "update_team"]},
    "admin": {"visibility": ["public", "team", "confidential", "restricted"], "actions": ["all"]},
}


def get_allowed_visibilities(requesting_agent: Agent, target_agent: Agent) -> list[str]:
    """Determine what visibility levels the requesting agent can access from the target.

    Rules:
    - Same department: can see "public" and "team" entries
    - Different department: can only see "public" entries
    - Admin scope: can see everything
    - Explicit scope grants override department rules
    """
    scopes = requesting_agent.scopes or []

    # Admin sees everything
    if "admin" in scopes:
        return ["public", "team", "confidential", "restricted"]

    allowed = set()

    # Base: everyone can see public
    allowed.add("public")

    # Same department gets team access
    req_depts = set(requesting_agent.departments or [])
    target_depts = set(target_agent.departments or [])
    if req_depts & target_depts:  # any overlap
        allowed.add("team")

    # Explicit scope grants
    for scope in scopes:
        grants = SCOPE_GRANTS.get(scope, {})
        for vis in grants.get("visibility", []):
            allowed.add(vis)

    return list(allowed)


def filter_knowledge_entries(
    entries: list[dict],
    requesting_agent: Agent,
    target_agent: Agent,
) -> list[dict]:
    """Filter knowledge entries based on the requesting agent's permissions.

    Each knowledge entry has a "visibility" field. Only entries whose visibility
    matches the requesting agent's allowed visibilities are returned.
    """
    allowed = get_allowed_visibilities(requesting_agent, target_agent)

    filtered = []
    for entry in entries:
        entry_vis = entry.get("visibility", "public")
        if entry_vis in allowed:
            filtered.append(entry)
        else:
            log.debug(
                f"Filtered out entry '{entry.get('topic', '?')}' "
                f"(visibility={entry_vis}, allowed={allowed})"
            )

    log.info(
        f"Permission filter: {requesting_agent.name} → {target_agent.name}: "
        f"{len(filtered)}/{len(entries)} entries allowed "
        f"(visibilities: {allowed})"
    )
    return filtered


def filter_documents(
    documents: list[dict],
    requesting_agent: Agent,
    target_agent: Agent,
) -> list[dict]:
    """Filter documents based on permissions.

    Documents with sensitivity="restricted" require explicit scope.
    """
    allowed = get_allowed_visibilities(requesting_agent, target_agent)

    filtered = []
    for doc in documents:
        doc_vis = doc.get("sensitivity", "public")
        if doc_vis in allowed:
            filtered.append(doc)

    return filtered


def check_action_permission(
    requesting_agent: Agent,
    action: str,
    target_agent: Agent | None = None,
) -> bool:
    """Check if an agent is allowed to perform a specific action.

    Actions: "query" (always allowed), "share_document" (requires approval),
    "update_task" (scope-dependent), "send_notification" (always allowed).
    """
    # Queries and notifications are always allowed
    if action in ("query", "send_notification"):
        return True

    # Document sharing always requires human approval in Phase 1
    if action == "share_document":
        return False  # triggers approval flow

    # Task updates require write scope
    scopes = requesting_agent.scopes or []
    if action == "update_task":
        return any(s.startswith("write:") or s == "admin" for s in scopes)

    return False


def build_permission_context(requesting_agent: Agent, target_agent: Agent) -> dict:
    """Build a permission context dict for logging and audit.

    This gets attached to every inter-agent message for the audit trail.
    """
    return {
        "requesting_agent_id": str(requesting_agent.id),
        "requesting_agent_name": requesting_agent.name,
        "requesting_role": requesting_agent.role,
        "requesting_departments": requesting_agent.departments,
        "requesting_scopes": requesting_agent.scopes,
        "target_agent_id": str(target_agent.id),
        "target_agent_name": target_agent.name,
        "allowed_visibilities": get_allowed_visibilities(requesting_agent, target_agent),
    }
