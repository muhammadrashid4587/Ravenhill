"""Google Meet integration — OAuth, Calendar API, and transcript fetching.

Flow:
1. User connects their Google account via OAuth (Calendar + Drive scopes)
2. We list their recent Calendar events that had Google Meet links
3. For each meeting, we fetch the auto-generated transcript from Google Drive
4. Transcript is passed to the extraction pipeline

Google Meet auto-saves transcripts as Google Docs in the user's Drive,
typically in a "Meet Recordings" folder. We find them by searching Drive
for docs linked to the calendar event.

When Google credentials are not configured, all functions raise clear errors
so the frontend can show "Connect Google" instead of crashing.
"""

import logging
from uuid import UUID

from config import settings
from integrations.google_tokens import (
    GoogleTokenBundle,
    is_connected,
    load_tokens,
    save_tokens,
)

log = logging.getLogger("integrations.google_meet")

# Google OAuth scopes needed.
# Single consent covers Calendar + Drive + Gmail so one OAuth flow unlocks
# every workspace surface (Calendar, Drive, Inbox, Meet transcript fetch).
SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/contacts.other.readonly",
]


def _is_configured() -> bool:
    """Check if Google OAuth credentials are set."""
    return bool(settings.google_client_id and settings.google_client_secret)


def _coerce_agent_uuid(agent_id: str | UUID) -> UUID | None:
    """Turn the loose `agent_id` used in query params into a real UUID.

    Returns None for the seed-mode sentinels ("demo", empty) so callers can
    skip the DB entirely — there's no user to link tokens to.
    """
    if not agent_id or agent_id == "demo":
        return None
    if isinstance(agent_id, UUID):
        return agent_id
    try:
        return UUID(agent_id)
    except (ValueError, AttributeError):
        return None


async def _get_tokens(agent_id: str | UUID) -> GoogleTokenBundle | None:
    """Load the stored Google tokens for an agent, decrypted.

    Accepts either a UUID or a string (query-param ergonomics). Returns
    None for seed/unauth callers so the adapters can fall back to mock data.
    """
    uid = _coerce_agent_uuid(agent_id)
    if uid is None:
        return None
    return await load_tokens(uid)


async def _has_tokens(agent_id: str | UUID) -> bool:
    """Cheap existence check that avoids decrypting the bundle."""
    uid = _coerce_agent_uuid(agent_id)
    if uid is None:
        return False
    return await is_connected(uid)


async def get_auth_url() -> str:
    """Generate Google OAuth authorization URL.

    The user visits this URL, grants access, and Google redirects back
    with an authorization code.
    """
    if not _is_configured():
        raise ValueError(
            "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET "
            "in your .env file."
        )

    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.google_redirect_uri],
            }
        },
        scopes=SCOPES,
    )
    flow.redirect_uri = settings.google_redirect_uri
    # Disable PKCE for this flow. Without this, newer
    # google-auth-oauthlib versions auto-generate a code_verifier and
    # add a code_challenge to the auth URL — but the Flow instance
    # holding the verifier is destroyed when this function returns,
    # so the callback's fresh Flow can't replay it. Google then
    # rejects the token exchange with "(invalid_grant) Missing code
    # verifier". We're a confidential web client (have client_secret)
    # so PKCE is optional; disabling here keeps OAuth working without
    # plumbing the verifier through `state` or storing it server-side.
    flow.autogenerate_code_verifier = False
    flow.code_verifier = None

    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return auth_url


async def handle_auth_callback(code: str, agent_id: str) -> dict:
    """Exchange authorization code for tokens and persist them encrypted.

    The `agent_id` must resolve to a real AgentRow (with an `org_id`) —
    otherwise we refuse to store tokens, since a row without a tenant
    would leak across orgs on any join-less lookup.
    """
    if not _is_configured():
        raise ValueError("Google OAuth not configured.")

    uid = _coerce_agent_uuid(agent_id)
    if uid is None:
        raise ValueError(
            "Connect requires a signed-in agent. "
            "Seed / demo sessions cannot store Google tokens."
        )

    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.google_redirect_uri],
            }
        },
        scopes=SCOPES,
    )
    flow.redirect_uri = settings.google_redirect_uri

    # fetch_token is a blocking HTTP call; punt to a thread so the event
    # loop stays responsive for concurrent requests.
    import asyncio

    await asyncio.to_thread(flow.fetch_token, code=code)

    creds = flow.credentials
    try:
        await save_tokens(
            uid,
            access_token=creds.token,
            refresh_token=creds.refresh_token,
            token_uri=creds.token_uri,
            client_id=creds.client_id,
            client_secret=creds.client_secret,
            scopes=list(creds.scopes or SCOPES),
            expiry=creds.expiry,
        )
    except LookupError as exc:
        raise ValueError(str(exc))

    log.info("Google OAuth tokens stored for agent %s", uid)
    return {"status": "connected", "agent_id": str(uid)}


async def _build_credentials(agent_id: str | UUID):
    """Build Google credentials object from the stored (encrypted) tokens."""
    tokens = await _get_tokens(agent_id)
    if tokens is None:
        raise ValueError(
            "Not authenticated with Google. Connect your Google account first."
        )

    from google.oauth2.credentials import Credentials

    return Credentials(
        token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_uri=tokens.token_uri,
        client_id=tokens.client_id,
        client_secret=tokens.client_secret,
        scopes=tokens.scopes or SCOPES,
    )


async def list_recent_meetings(agent_id: str) -> list[dict]:
    """List recent Google Calendar events that had Google Meet sessions.

    Returns events from the last 7 days that have a conferenceData
    (i.e., had a Google Meet link attached).
    """
    if not _is_configured():
        # Return mock data when Google isn't configured
        return _mock_recent_meetings()

    if not await _has_tokens(agent_id):
        # Return mock data when not authenticated
        return _mock_recent_meetings()

    import asyncio
    from datetime import datetime, timedelta, timezone
    from googleapiclient.discovery import build

    creds = await _build_credentials(agent_id)

    def _fetch():
        service = build("calendar", "v3", credentials=creds)
        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)

        events_result = service.events().list(
            calendarId="primary",
            timeMin=week_ago.isoformat(),
            timeMax=now.isoformat(),
            singleEvents=True,
            orderBy="startTime",
            maxResults=20,
        ).execute()

        events = events_result.get("items", [])
        meet_events = []
        for event in events:
            # Only include events with Google Meet
            if event.get("conferenceData"):
                meet_events.append({
                    "event_id": event["id"],
                    "title": event.get("summary", "Untitled Meeting"),
                    "start_time": event["start"].get("dateTime", event["start"].get("date", "")),
                    "end_time": event["end"].get("dateTime", event["end"].get("date", "")),
                    "attendees": [
                        a.get("email", "") for a in event.get("attendees", [])
                    ],
                    "has_transcript": True,  # we'll verify when actually fetching
                })
        return meet_events

    return await asyncio.to_thread(_fetch)


async def fetch_meeting_transcript(agent_id: str, calendar_event_id: str) -> dict:
    """Fetch the transcript for a specific Google Meet meeting.

    Google Meet saves transcripts as Google Docs in the user's Drive.
    We search for them by the meeting/event reference.
    """
    if not _is_configured() or not await _has_tokens(agent_id):
        # Return mock transcript
        return _mock_transcript(calendar_event_id)

    import asyncio
    from googleapiclient.discovery import build

    creds = await _build_credentials(agent_id)

    def _fetch():
        # First, get the calendar event to find the meeting title
        cal_service = build("calendar", "v3", credentials=creds)
        event = cal_service.events().get(
            calendarId="primary",
            eventId=calendar_event_id,
        ).execute()
        title = event.get("summary", "Untitled Meeting")

        # Search Drive for the transcript
        # Google Meet transcripts are saved as Docs with names like
        # "Meeting transcript - [Meeting Title] - [Date]"
        drive_service = build("drive", "v3", credentials=creds)
        query = f"name contains 'transcript' and name contains '{title}' and mimeType='application/vnd.google-apps.document'"
        results = drive_service.files().list(
            q=query,
            orderBy="modifiedTime desc",
            pageSize=5,
            fields="files(id, name, modifiedTime)",
        ).execute()

        files = results.get("files", [])
        if not files:
            # Try broader search
            query = "name contains 'transcript' and mimeType='application/vnd.google-apps.document'"
            results = drive_service.files().list(
                q=query,
                orderBy="modifiedTime desc",
                pageSize=5,
                fields="files(id, name, modifiedTime)",
            ).execute()
            files = results.get("files", [])

        if not files:
            raise ValueError(f"No transcript found for meeting '{title}'. "
                           "Make sure transcription was enabled in Google Meet.")

        # Export the Google Doc as plain text
        doc_id = files[0]["id"]
        content = drive_service.files().export(
            fileId=doc_id,
            mimeType="text/plain",
        ).execute()

        transcript = content.decode("utf-8") if isinstance(content, bytes) else content
        return {"title": title, "transcript": transcript}

    return await asyncio.to_thread(_fetch)


# ---- Mock data for demo mode ----

def _mock_recent_meetings() -> list[dict]:
    """Return mock Google Calendar events for demo mode."""
    return [
        {
            "event_id": "mock-event-001",
            "title": "Marketplace Redesign Sync",
            "start_time": "2026-04-07T10:00:00-04:00",
            "end_time": "2026-04-07T10:45:00-04:00",
            "attendees": [
                "riley.chen@company.com",
                "jordan.park@company.com",
                "sam.torres@company.com",
                "alex.kumar@company.com",
            ],
            "has_transcript": True,
        },
        {
            "event_id": "mock-event-002",
            "title": "Sprint 15 Planning",
            "start_time": "2026-04-07T14:00:00-04:00",
            "end_time": "2026-04-07T15:00:00-04:00",
            "attendees": [
                "jordan.park@company.com",
                "sam.torres@company.com",
            ],
            "has_transcript": True,
        },
        {
            "event_id": "mock-event-003",
            "title": "Vendor Review — Stripe Integration",
            "start_time": "2026-04-06T11:00:00-04:00",
            "end_time": "2026-04-06T11:30:00-04:00",
            "attendees": [
                "alex.kumar@company.com",
                "sam.torres@company.com",
            ],
            "has_transcript": True,
        },
    ]


def _mock_transcript(event_id: str) -> dict:
    """Return a mock transcript for demo mode."""
    transcripts = {
        "mock-event-001": {
            "title": "Marketplace Redesign Sync",
            "transcript": (
                "Riley Chen: Alright everyone, let's get an update on the marketplace redesign. "
                "Jordan, where are we?\n\n"
                "Jordan Park: Designs are complete and approved. The frontend team finished "
                "the component library last week. But we're stuck on the backend — Sam, "
                "can you give us the engineering picture?\n\n"
                "Sam Torres: Yeah, so three of my engineers are blocked on the Stripe API "
                "integration. We've been waiting on their updated API docs since March 28. "
                "Without those docs, we can't build the payment dashboard. That's the critical "
                "path item.\n\n"
                "Riley Chen: That's two weeks of delay already. Alex, what's the status on "
                "the Stripe relationship?\n\n"
                "Alex Kumar: I spoke with Rachel Torres, our account manager at Stripe, "
                "yesterday. She confirmed the docs will be delivered by end of day Thursday. "
                "I'll follow up Wednesday to make sure that holds.\n\n"
                "Riley Chen: Good. Sam, once docs arrive, how long to finish the dashboard?\n\n"
                "Sam Torres: If docs land Thursday, my team can start Friday. I'd estimate "
                "two weeks for the full integration, maybe 10 business days. So we're looking "
                "at April 24 for the payment piece.\n\n"
                "Jordan Park: That pushes our launch past May 15. I'll need to update the "
                "timeline and communicate to stakeholders.\n\n"
                "Riley Chen: Jordan, can you update the launch timeline to account for the "
                "delay? We need a realistic date for the board. The board review is April 14 "
                "and I need updated slides showing the revised plan.\n\n"
                "Riley Chen: Alex, please share the vendor contract with Sam's team so they "
                "can prep the integration while waiting for docs.\n\n"
                "Alex Kumar: Will do. I'll send over the MSA and the relevant API terms today.\n\n"
                "Sam Torres: That would help. My team can at least set up the test environment "
                "and stub out the integration points.\n\n"
                "Riley Chen: Good. Let's regroup Monday with the updated timeline. "
                "Jordan, that's on you. Sam, I want the sprint estimate by Friday. "
                "Alex, confirm the doc delivery Wednesday. Anything else?\n\n"
                "Jordan Park: One more thing — the A/B test on the simplified listing flow "
                "showed a 23% improvement in completion rate. I'll share the full report "
                "in the product channel.\n\n"
                "Riley Chen: Great news. Alright, let's move. Thanks everyone."
            ),
        },
        "mock-event-002": {
            "title": "Sprint 15 Planning",
            "transcript": (
                "Jordan Park: Let's plan sprint 15. Sam, what's the team's capacity?\n\n"
                "Sam Torres: We have 6 engineers available. Three are blocked on Stripe, "
                "so they're picking up tech debt items. One is on the bulk listing tool, "
                "one on CI/CD migration, and I'm doing code reviews and the security audit "
                "remediation.\n\n"
                "Jordan Park: For the three on tech debt — can we redirect them to the "
                "search relevance improvement? Buyer satisfaction dropped to 4.1 and search "
                "is the main complaint.\n\n"
                "Sam Torres: Two of them can switch. Marcus is deep in the auth module "
                "refactor and pulling him out would lose a week of context. I'll move "
                "Priya and Chen to search.\n\n"
                "Jordan Park: Perfect. Sprint goal: improve search relevance by 15% and "
                "ship the bulk listing tool. Sam, can you write up the search tickets "
                "by end of day?\n\n"
                "Sam Torres: Done. I'll also need Jordan to review the search algorithm "
                "spec — I'll send it over this afternoon.\n\n"
                "Jordan Park: Got it. Let's do a mid-sprint check Wednesday."
            ),
        },
        "mock-event-003": {
            "title": "Vendor Review — Stripe Integration",
            "transcript": (
                "Alex Kumar: Quick sync on the Stripe situation. Sam, what specifically "
                "do your engineers need from the docs?\n\n"
                "Sam Torres: Three things: the webhook event schemas for the new Checkout "
                "Sessions API, the idempotency key requirements for the Payment Intents "
                "migration, and the test mode credentials for the sandbox environment.\n\n"
                "Alex Kumar: I'll make sure Rachel knows those are the priorities. "
                "The MSA we signed covers up to 10,000 transactions per month at the "
                "12% rate. If we hit that ceiling, we need to renegotiate.\n\n"
                "Sam Torres: Based on our current volume of 5,700 transactions, we have "
                "room. But with the marketplace redesign, Jordan's projecting 40% growth "
                "in Q3. We might hit the cap by August.\n\n"
                "Alex Kumar: Good to flag now. I'll start the renegotiation conversation "
                "in May so we're not scrambling. Can you send me the projected transaction "
                "volumes by department?\n\n"
                "Sam Torres: I'll pull the numbers from our analytics dashboard and send "
                "them over by Friday."
            ),
        },
    }

    if event_id in transcripts:
        return transcripts[event_id]

    # Fallback for unknown event IDs
    return transcripts["mock-event-001"]
