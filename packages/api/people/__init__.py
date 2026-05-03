"""People surface — agents the current user already knows.

Built from two sources:
1. Google Contacts (saved + auto-discovered "other contacts"), and
2. Agents sharing the user's email domain.

Both sources are intersected with the active agents table — only people
who actually have a Ravenhill account show up.
"""

from .router import router

__all__ = ["router"]
