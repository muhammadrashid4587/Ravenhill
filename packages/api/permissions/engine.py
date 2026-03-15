"""Permission engine — zero-trust access control between agents.

Every inter-agent message carries permission context. This engine checks
whether the requesting agent has the scopes needed to access the target
agent's data. Permissions inherit from the company's IdP (Okta, Azure AD, etc.).

Phase 0: Simple scope-based checks.
Phase 2: Full IdP sync.
"""

from messaging.models import PermissionContext


def can_access(requester: PermissionContext, required_scopes: list[str]) -> bool:
    """Check if the requester has the required scopes."""
    return all(scope in requester.scopes for scope in required_scopes)


def requires_approval(requester: PermissionContext, action: str) -> bool:
    """Determine if an action requires human approval based on the requester's role.

    Default: conservative. Everything that touches another person's data
    requires approval until explicitly loosened.
    """
    # For Phase 0, file sharing always requires approval
    if action in ("share_file", "access_sensitive_data"):
        return True

    # Public data queries don't need approval
    if "read:public" in requester.scopes:
        return False

    return True
