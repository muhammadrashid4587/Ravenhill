"""The capability registry — every tool the agent can autonomously
exercise on the human's behalf, grouped by reversibility lane.

Three rules to keep this honest:
1. Every entry must map to real runtime code that respects the
   permission. No decorative entries — if the agent can't actually do
   the thing yet, the tool isn't here.
2. Three lanes: `observation` (read-only, safe to auto), `soft` (writes
   that are reversible or human-visible), `hard` (externally visible,
   hard to undo). Default permissions get more conservative as the
   lane gets riskier.
3. New capabilities land here when the runtime path is wired, not
   when the integration is connected. Connection-state lives elsewhere
   (e.g. `google_status` for Google) — the registry only describes
   what the agent *would* do if connected.
"""

from dataclasses import dataclass
from typing import Literal

Permission = Literal["auto", "ask", "never"]
Lane = Literal["observation", "soft", "hard"]


@dataclass(frozen=True)
class Capability:
    """A single thing the agent can autonomously do.

    `tool_id` is the stable string the DB stores — never rename, only
    deprecate. `default` applies on first signup; `learned_default`
    documents what the shadow observer would suggest after enough
    signal (used for hints in the UI, not for runtime).
    """
    tool_id: str
    name: str
    description: str
    lane: Lane
    default: Permission
    requires_integration: str | None = None  # e.g. "google", "slack"


REGISTRY: tuple[Capability, ...] = (
    # ---- Lane 1: Observation (read-only, always safe to auto) ----
    Capability(
        tool_id="read_inbound_inter_agent_messages",
        name="Read incoming messages from other agents",
        description=(
            "Your agent receives messages from teammate agents. Reading "
            "them is the entry point for auto-reply and triage."
        ),
        lane="observation",
        default="auto",
    ),
    Capability(
        tool_id="read_org_directory",
        name="See teammates in your organization",
        description=(
            "Look up colleagues, their roles, and their public knowledge "
            "areas — the basis for routing questions to the right person."
        ),
        lane="observation",
        default="auto",
    ),
    Capability(
        tool_id="read_calendar",
        name="View your calendar",
        description="Read calendar events for context on availability and meetings.",
        lane="observation",
        default="auto",
        requires_integration="google",
    ),
    Capability(
        tool_id="read_drive_files",
        name="Search your Google Drive",
        description="List and search files. Reading file contents is a separate capability.",
        lane="observation",
        default="auto",
        requires_integration="google",
    ),
    Capability(
        tool_id="read_inbox_emails",
        name="Read recent emails",
        description="Pull recent Gmail threads for inbox triage.",
        lane="observation",
        default="auto",
        requires_integration="google",
    ),

    # ---- Lane 2: Soft actions (writes, reversible / human-visible) ----
    Capability(
        tool_id="auto_reply_to_inbound_messages",
        name="Auto-reply to other agents on your behalf",
        description=(
            "When a teammate's agent asks a question, your agent answers "
            "from your knowledge if confident; otherwise defers to you. "
            "Replies are visible to you in the inbox after the fact."
        ),
        lane="soft",
        default="auto",
    ),
    Capability(
        tool_id="share_public_knowledge",
        name="Share knowledge marked Public",
        description=(
            "Allow your agent to include knowledge entries you've marked "
            "`public` when answering teammates."
        ),
        lane="soft",
        default="auto",
    ),
    Capability(
        tool_id="share_team_knowledge",
        name="Share knowledge marked Team",
        description=(
            "Same as above but for `team` visibility — only teammates "
            "in your department will see these. Other-department agents "
            "still cannot."
        ),
        lane="soft",
        default="auto",
    ),
    Capability(
        tool_id="route_questions_to_other_agents",
        name="Route questions to other agents",
        description=(
            "If your agent gets a question outside its knowledge, it can "
            "ask a more relevant teammate's agent on your behalf."
        ),
        lane="soft",
        default="ask",
    ),
    Capability(
        tool_id="draft_email_replies",
        name="Draft email replies (saved as drafts)",
        description=(
            "Compose Gmail replies and save them as drafts for you to "
            "review before sending. Never sends without your click."
        ),
        lane="soft",
        default="ask",
        requires_integration="google",
    ),
    Capability(
        tool_id="post_in_slack_threads",
        name="Reply in Slack threads on your behalf",
        description=(
            "When mentioned in a Slack thread, draft and post a reply in "
            "your voice."
        ),
        lane="soft",
        default="ask",
        requires_integration="slack",
    ),

    # ---- Lane 3: Hard actions (externally visible, hard to undo) ----
    Capability(
        tool_id="share_confidential_knowledge",
        name="Share knowledge marked Confidential",
        description=(
            "Allow your agent to include `confidential` entries in answers. "
            "Recommended only when the requester explicitly has clearance."
        ),
        lane="hard",
        default="never",
    ),
    Capability(
        tool_id="approve_file_requests",
        name="Approve another agent's file request",
        description=(
            "Auto-approve incoming requests to share files. Even with auto, "
            "every action is logged in the approval audit trail."
        ),
        lane="hard",
        default="never",
    ),
    Capability(
        tool_id="send_emails_externally",
        name="Send email to recipients outside your org",
        description=(
            "Send Gmail messages without your review. Recommended off."
        ),
        lane="hard",
        default="never",
        requires_integration="google",
    ),
    Capability(
        tool_id="schedule_external_meetings",
        name="Schedule meetings with external attendees",
        description="Create calendar events that include people outside your org.",
        lane="hard",
        default="never",
        requires_integration="google",
    ),
)


_BY_ID: dict[str, Capability] = {c.tool_id: c for c in REGISTRY}


def get(tool_id: str) -> Capability | None:
    return _BY_ID.get(tool_id)


def all_tool_ids() -> list[str]:
    return [c.tool_id for c in REGISTRY]
