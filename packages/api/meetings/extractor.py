"""LLM-powered task extraction from meeting transcripts.

Takes raw transcript text, calls the LLM with a structured extraction prompt,
and returns a summary + list of tasks. Falls back to mock extraction when in
mock mode (critical for demo).
"""

import logging

from agents.llm_providers import call_llm_structured, get_active_provider

log = logging.getLogger("meetings.extractor")


_EXTRACT_SYSTEM = """You are a meeting analyst for an enterprise AI agent system.

Your job: analyze a meeting transcript and extract actionable tasks for the employee.

Rules:
- Extract ONLY concrete, actionable tasks — not observations or discussion points
- Each task needs a clear title (imperative verb), description, and priority
- Include the relevant transcript excerpt so the employee knows the context
- Detect any files or documents mentioned in the meeting
- Write the summary as a 2-3 sentence briefing, not a play-by-play
- Priority: "high" = blocking or time-sensitive, "medium" = important but not urgent, "low" = nice-to-have
- If dates/deadlines are mentioned, note them in the task description

Return valid JSON matching the schema provided."""


_EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {
            "type": "string",
            "description": "2-3 sentence meeting summary focused on decisions and action items",
        },
        "tasks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Short imperative task title"},
                    "description": {
                        "type": "string",
                        "description": "Detailed description with context from the meeting",
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                    },
                    "source_excerpt": {
                        "type": "string",
                        "description": "The relevant quote from the transcript",
                    },
                },
                "required": ["title", "description", "priority"],
            },
        },
        "mentioned_files": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Filenames or documents referenced in the meeting",
        },
    },
    "required": ["summary", "tasks"],
}


async def extract_tasks(transcript: str) -> dict:
    """Extract tasks from a meeting transcript using the LLM.

    Returns dict with keys: summary, tasks, mentioned_files.
    Falls back to mock data if LLM is unavailable.
    """
    if get_active_provider() != "mock":
        result = await call_llm_structured(
            system=_EXTRACT_SYSTEM,
            user_message=f"Extract tasks from this meeting transcript:\n\n{transcript}",
            json_schema=_EXTRACT_SCHEMA,
            model_tier="reasoning",
            max_tokens=2048,
        )
        if result is not None:
            log.info(f"Extracted {len(result.get('tasks', []))} tasks via LLM")
            return result

    log.info("Using mock task extraction")
    return _mock_extract_tasks(transcript)


def _mock_extract_tasks(transcript: str) -> dict:
    """Return realistic mock extraction results for demo mode.

    Fits the existing demo narrative (marketplace redesign, Stripe blocker, etc.)
    """
    return {
        "summary": (
            "Team discussed the marketplace redesign timeline, which is at risk due to "
            "the Stripe API documentation delay. Engineering is blocked with 3 developers "
            "waiting. Alex confirmed docs are expected Thursday. Action items assigned "
            "across product, engineering, and operations."
        ),
        "tasks": [
            {
                "title": "Update marketplace redesign launch timeline",
                "description": (
                    "Revise the launch timeline to account for the Stripe API documentation "
                    "delay. The original May 15 target is at risk. Coordinate with Sam's "
                    "engineering team on revised estimates once docs arrive Thursday."
                ),
                "priority": "high",
                "source_excerpt": (
                    "Jordan, can you update the launch timeline to account for the delay? "
                    "We need a realistic date for the board."
                ),
            },
            {
                "title": "Estimate development sprint once Stripe API docs arrive",
                "description": (
                    "Once Stripe API documentation lands (expected Thursday April 10), "
                    "provide a revised sprint estimate for completing the payment dashboard "
                    "integration. Three engineers are currently blocked and ready to start."
                ),
                "priority": "high",
                "source_excerpt": (
                    "Sam, once docs arrive, how long to finish the dashboard? "
                    "We need this for the revised timeline."
                ),
            },
            {
                "title": "Share vendor contract with engineering team",
                "description": (
                    "Send the Stripe vendor contract (MSA and SLA docs) to Sam's engineering "
                    "team so they can prep integration work while waiting for API docs. "
                    "This can unblock some preliminary work."
                ),
                "priority": "medium",
                "source_excerpt": (
                    "Alex, please share the vendor contract with Sam's team so they can prep."
                ),
            },
            {
                "title": "Prepare updated board presentation slides",
                "description": (
                    "Update the Q2 board review deck to reflect the redesign delay and "
                    "revised timeline. Board review is April 14, deck due April 10. "
                    "Include risk mitigation plan for the Stripe dependency."
                ),
                "priority": "medium",
                "source_excerpt": (
                    "Riley mentioned the board review is April 14 — we need updated slides "
                    "showing the revised plan and risk mitigation."
                ),
            },
            {
                "title": "Follow up on Stripe API doc delivery Thursday",
                "description": (
                    "Confirm with Stripe account manager Rachel Torres that API documentation "
                    "will be delivered by end of day Thursday. If there's any risk of further "
                    "delay, escalate immediately."
                ),
                "priority": "low",
                "source_excerpt": (
                    "Alex confirmed docs are coming Thursday — let's make sure that holds."
                ),
            },
        ],
        "mentioned_files": [
            "Stripe vendor contract (MSA)",
            "Q2 board review deck",
            "Marketplace redesign launch timeline",
        ],
    }


_TASK_HELP_SYSTEM = """You are a helpful AI agent assisting an employee with a specific task.

You have context from the meeting where this task was assigned. Use that context to give
actionable, specific guidance on how to complete the task.

Be concise and practical:
- Break the task into concrete steps
- Reference specific people, tools, or files mentioned in the meeting
- Suggest what to do first
- Flag any blockers or dependencies

Do NOT be generic. Use the meeting context to give advice that is specific to this situation."""


async def get_task_help(
    task_title: str,
    task_description: str,
    meeting_summary: str,
    meeting_transcript: str,
    question: str | None = None,
) -> str:
    """Get AI help for executing a specific task, grounded in meeting context."""
    from agents.llm_providers import call_llm

    user_msg = f"""Meeting summary: {meeting_summary}

Task: {task_title}
Details: {task_description}

{"Question: " + question if question else "How should I approach this task? Give me concrete steps."}

Relevant meeting transcript for context:
{meeting_transcript[:3000]}"""

    if get_active_provider() != "mock":
        result = await call_llm(
            system=_TASK_HELP_SYSTEM,
            user_message=user_msg,
            model_tier="reasoning",
            max_tokens=1024,
        )
        if result is not None:
            return result

    return _mock_task_help(task_title)


def _mock_task_help(task_title: str) -> str:
    """Return realistic mock help for demo mode."""
    title_lower = task_title.lower()

    if "timeline" in title_lower or "launch" in title_lower:
        return (
            "Here's how I'd approach updating the timeline:\n\n"
            "1. **Get Sam's revised estimate first** — once Stripe docs land Thursday, "
            "he'll need 1-2 days to assess. Don't guess the engineering timeline.\n\n"
            "2. **Map the critical path** — the redesign has three phases: API integration "
            "(blocked), frontend components (in progress), and QA. Only the first is delayed.\n\n"
            "3. **Build in buffer** — the original May 15 date assumed docs arrived March 28. "
            "That's ~2 weeks of slip. Propose May 29 as the new target with a note that it "
            "depends on docs actually arriving Thursday.\n\n"
            "4. **Update the project tracker** — make sure Jira/Linear reflects the new dates "
            "so the team isn't working against stale deadlines.\n\n"
            "5. **Prep the board narrative** — Riley will need this for the April 14 review. "
            "Frame it as 'controlled delay with clear resolution path' not 'we're behind.'"
        )

    if "stripe" in title_lower or "api" in title_lower or "estimate" in title_lower:
        return (
            "Here's the plan for the sprint estimate:\n\n"
            "1. **Wait for docs** — they're expected Thursday from Rachel Torres at Stripe. "
            "Don't start estimating without them.\n\n"
            "2. **Timebox the review** — give yourself and the team 4 hours Thursday afternoon "
            "to read through the docs and identify integration points.\n\n"
            "3. **Break it into work packages** — likely: auth/token management, payment flow, "
            "webhook handlers, and the dashboard UI. Estimate each separately.\n\n"
            "4. **Account for the 3 blocked engineers** — they've been context-switched to other "
            "work. Factor in 1 day of ramp-up time to get back into the redesign codebase.\n\n"
            "5. **Send the estimate to Jordan by Friday EOD** — she needs it for the timeline update."
        )

    if "contract" in title_lower or "vendor" in title_lower or "share" in title_lower:
        return (
            "Quick steps to share the vendor contract:\n\n"
            "1. **Find the document** — the Stripe MSA was signed March 1, should be in the "
            "shared ops drive or legal folder.\n\n"
            "2. **Check sharing permissions** — the MSA may have confidentiality clauses. "
            "Verify with legal that engineering can access it.\n\n"
            "3. **Share the relevant sections** — Sam's team probably doesn't need the full "
            "60-page MSA. Extract the API terms, SLA guarantees, and rate limits.\n\n"
            "4. **Add context** — send it with a note explaining what they should focus on "
            "for the integration prep work."
        )

    return (
        f"Here's how to approach '{task_title}':\n\n"
        "1. **Review the meeting context** — check the transcript excerpt for specific "
        "details and expectations.\n\n"
        "2. **Identify dependencies** — who else needs to do something before you can "
        "complete this? Reach out to them first.\n\n"
        "3. **Set a deadline** — even if one wasn't explicitly given, pick a reasonable "
        "target and communicate it to stakeholders.\n\n"
        "4. **Start with the smallest piece** — break it down and do the first concrete "
        "action within 30 minutes."
    )
