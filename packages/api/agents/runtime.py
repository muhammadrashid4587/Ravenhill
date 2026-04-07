"""
Agent Runtime — the core execution engine for each employee's agent.

Each agent instance:
- Has a persona (role, department, knowledge areas)
- Calls an LLM for reasoning (fast tier for routing, reasoning tier for complex tasks)
- Executes tools on behalf of the employee
- Sends/receives messages through ETO

Provider selection is handled by `agents.llm_providers` — supports Anthropic,
Groq, Gemini, and auto-fallback.  When all providers are unavailable, falls back
to smart mock mode with realistic canned responses for the demo flows.
"""

import json
import logging
import re
from collections.abc import AsyncGenerator

from agents.models import Agent
from agents.llm_providers import call_llm, call_llm_structured, stream_llm, get_active_provider

log = logging.getLogger("runtime")


async def process_message(agent: Agent, message: str) -> str:
    """Process an incoming message using the agent's persona and an LLM."""
    if get_active_provider() != "mock":
        system_prompt = _build_system_prompt(agent)
        result = await call_llm(system=system_prompt, user_message=message, model_tier="reasoning")
        if result is not None:
            return result

    return _mock_process_message(agent, message)


async def stream_message(agent: Agent, message: str) -> AsyncGenerator[str, None]:
    """Stream a response from the agent's LLM, yielding text chunks.

    Falls back to the mock response as a single yield when streaming is unavailable.
    """
    if get_active_provider() != "mock":
        system_prompt = _build_system_prompt(agent)
        yielded = False
        async for chunk in stream_llm(system=system_prompt, user_message=message):
            yielded = True
            yield chunk
        if yielded:
            return

    yield _mock_process_message(agent, message)


async def classify_intent(message: str) -> str:
    """Use a fast model to quickly classify the intent of an incoming message."""
    if get_active_provider() != "mock":
        result = await call_llm(
            system="Classify the intent of this message. Respond with one of: QUERY, DOC_REQUEST, ACTION, BROADCAST",
            user_message=message,
            model_tier="fast",
            max_tokens=100,
        )
        if result is not None:
            return result.strip()

    return _mock_classify_intent(message)


_CLASSIFY_ROUTE_SYSTEM = """You are a message classifier for an enterprise agent system.
Analyze the message and return a JSON object with these fields:
- "intent": one of "information_query", "follow_up", "action_request", "clarification"
- "topic": a short topic label (e.g., "marketplace redesign", "api dependency", "vendor contract")
- "summary": a one-sentence summary of what is being asked

Intent guidance:
- "information_query": asking a question about the state of the company, a project, a metric
- "follow_up": asking for more detail about a previous topic, referencing something just discussed
- "action_request": asking to do something — send a message, share a document, request something
- "clarification": the message is unclear or too vague to route

Rules:
- If the message asks to share, send, or request a document/file/contract, intent is "action_request"
- If the message asks about status, progress, metrics, or blockers, intent is "information_query"
- If the message references "the" blocker/dependency/issue (definite article suggesting prior context), intent is "follow_up"

Respond ONLY with valid JSON. No other text."""

_CLASSIFY_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "intent": {
            "type": "string",
            "enum": ["information_query", "follow_up", "action_request", "clarification"],
        },
        "topic": {"type": "string", "description": "Short topic label"},
        "summary": {"type": "string", "description": "One-sentence summary"},
    },
    "required": ["intent", "topic", "summary"],
    "additionalProperties": False,
}


async def classify_and_route(message: str) -> dict:
    """Use a fast model to classify intent AND extract routing info as structured JSON.

    Prefers ``call_llm_structured`` for schema-validated output (Anthropic-native).
    Falls back to mock mode if anything fails.

    Returns dict with keys: intent, topic, summary
    """
    if get_active_provider() != "mock":
        try:
            result = await call_llm_structured(
                system=_CLASSIFY_ROUTE_SYSTEM,
                user_message=message,
                json_schema=_CLASSIFY_SCHEMA,
                model_tier="fast",
                max_tokens=200,
            )
            if result is not None:
                return result
        except Exception:
            pass  # Fall through to mock

    return _mock_classify_and_route(message)


# ---------------------------------------------------------------------------
# Combined classify + extract (single LLM call)
# ---------------------------------------------------------------------------

_CLASSIFY_EXTRACT_SYSTEM = """You are a message classifier and routing system for an enterprise \
agent platform. Analyze the message and return a JSON object with these fields:
- "intent": one of "information_query", "follow_up", "action_request", "clarification"
- "topic": a short topic label (e.g., "marketplace redesign", "api dependency", "vendor contract")
- "summary": a one-sentence summary of what is being asked
- "selected_keys": an array of 1-3 topic keys from the provided list that are relevant

Intent guidance:
- "information_query": asking about the state of the company, a project, a metric, what someone \
has been doing, what's happening in a department
- "follow_up": asking for more detail about a previous topic, referencing something just discussed, \
or short affirmative responses like "yes", "go ahead", "do it", "you have my go ahead"
- "action_request": asking to share/send a SPECIFIC document or notify a SPECIFIC person about something
- "clarification": the message is genuinely ambiguous AND not a follow-up to previous conversation

Rules:
- "action_request" is ONLY for sharing documents or notifying someone. Asking questions like \
"reach out to X", "check with X", "what has X been doing" are information_query or follow_up.
- If the message asks about status, progress, metrics, blockers, WHO is responsible, or what someone \
is working on, intent is "information_query"
- If the user mentions a person's name and asks what they're working on, working on recently, or \
their status, this is "information_query" — match keys related to that person's department
- If the message references the previous conversation (e.g., "these delays", "that", "why", "how", \
"it"), intent is "follow_up". Use conversation history to determine the relevant keys.
- Short messages like "yes", "go ahead", "you have my go ahead", "please do", "do it" are \
"follow_up" — use the conversation history to determine what the user is agreeing to.
- For selected_keys: choose BROADLY. If asking about a person, pick keys from their domain. \
If asking "what has Alex been working on", pick ops-related keys (vendor, onboarding, support, etc). \
If asking about a topic like "how to resolve X", pick keys about X.
- ONLY choose from the provided available_keys list. Do not invent new keys.
- If no keys match, return an empty array for selected_keys.

Respond ONLY with valid JSON. No other text."""

_CLASSIFY_EXTRACT_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "intent": {
            "type": "string",
            "enum": ["information_query", "follow_up", "action_request", "clarification"],
        },
        "topic": {"type": "string", "description": "Short topic label"},
        "summary": {"type": "string", "description": "One-sentence summary"},
        "selected_keys": {
            "type": "array",
            "items": {"type": "string"},
            "description": "1-3 relevant topic keys from the available set",
        },
    },
    "required": ["intent", "topic", "summary", "selected_keys"],
    "additionalProperties": False,
}


async def classify_and_extract(
    message: str,
    available_keys: list[str],
    conversation_history: list[str] | None = None,
) -> dict:
    """Combined intent classification + topic key extraction in one LLM call.

    Returns dict with keys: intent, topic, summary, selected_keys
    """
    if get_active_provider() != "mock":
        history_text = ""
        if conversation_history:
            history_text = (
                f"\nConversation history (last 3 messages): "
                f"{'; '.join(conversation_history[-3:])}"
            )

        user_prompt = (
            f"Available topic keys: {json.dumps(available_keys)}\n\n"
            f"User message: \"{message}\"{history_text}"
        )

        try:
            result = await call_llm_structured(
                system=_CLASSIFY_EXTRACT_SYSTEM,
                user_message=user_prompt,
                json_schema=_CLASSIFY_EXTRACT_SCHEMA,
                model_tier="fast",
                max_tokens=300,
            )
            if result is not None:
                # Filter selected_keys to only valid keys
                result["selected_keys"] = [
                    k for k in result.get("selected_keys", [])
                    if k in available_keys
                ][:3]

                # If LLM returned no keys, try mock keyword extraction as backup
                # (the LLM sometimes misses person-name → domain mappings)
                if not result["selected_keys"]:
                    mock_result = _mock_classify_and_extract(
                        message, available_keys, conversation_history,
                    )
                    if mock_result.get("selected_keys"):
                        result["selected_keys"] = mock_result["selected_keys"]

                return result
        except Exception:
            pass  # Fall through to mock

    return _mock_classify_and_extract(message, available_keys, conversation_history)


# Short/vague messages that need conversation context to understand
_VAGUE_PATTERNS = re.compile(
    r"^(yes|yeah|yep|sure|ok|okay|go ahead|do it|please|all good|"
    r"thank you|thanks|no|nope|got it|cool|great|sounds good|"
    r"tell me more|go on|continue|what else|anything else|"
    r"that works|perfect|nice|right|correct|exactly)[\.\!\?\,\s]*$",
    re.IGNORECASE,
)


def _mock_classify_and_extract(
    message: str,
    available_keys: list[str],
    conversation_history: list[str] | None = None,
) -> dict:
    """Mock combined classify + extract using keyword heuristics.

    When the message is vague (e.g. "yes", "thanks"), falls back to
    conversation history to figure out intent and topic keys.
    """
    q_lower = message.lower().strip()

    # If the message is vague/short AND we have conversation history,
    # use the last assistant message as the effective context
    effective_message = message
    is_vague = _VAGUE_PATTERNS.match(q_lower) or len(q_lower.split()) <= 3

    if is_vague and conversation_history:
        # Find the last assistant message in history
        last_assistant = None
        for h in reversed(conversation_history):
            if h.startswith("assistant:"):
                last_assistant = h[len("assistant:"):].strip()
                break

        if last_assistant:
            # Affirmative responses → treat as follow_up on previous topic
            is_affirmative = any(
                w in q_lower for w in (
                    "yes", "yeah", "yep", "sure", "ok", "okay", "go ahead",
                    "do it", "please", "tell me more", "go on", "continue",
                )
            )
            # Dismissive responses → acknowledge and close
            is_dismissive = any(
                w in q_lower for w in (
                    "thank", "thanks", "all good", "got it", "cool", "great",
                    "nice", "perfect", "sounds good", "no", "nope",
                )
            )

            if is_dismissive:
                return {
                    "intent": "clarification",
                    "topic": "acknowledgment",
                    "summary": "User acknowledged previous response",
                    "selected_keys": [],
                    "_dismissive": True,
                }

            if is_affirmative:
                # Use the last assistant message for keyword extraction
                effective_message = last_assistant

    base = _mock_classify_and_route(effective_message)

    # If we derived context from history, mark as follow_up
    if effective_message != message and not base.get("_dismissive"):
        base["intent"] = "follow_up"

    # Reuse the keyword_map from discovery for key extraction
    q_lower = effective_message.lower()
    selected: list[str] = []

    keyword_map = {
        "redesign": [
            "marketplace_redesign_status", "marketplace_redesign",
            "platform_redesign", "marketplace_update",
        ],
        "marketplace": [
            "marketplace_redesign_status", "marketplace_redesign",
            "platform_redesign", "marketplace_update",
        ],
        "on track": [
            "marketplace_redesign_status", "sprint_progress",
            "feature_status",
        ],
        "api": [
            "stripe_api_blocker", "api_dependencies", "api_integrations",
        ],
        "dependency": [
            "stripe_api_blocker", "api_dependencies", "api_integrations",
        ],
        "blocker": ["stripe_api_blocker", "blockers", "api_dependencies"],
        "blocked": ["stripe_api_blocker", "blockers", "api_dependencies"],
        "stripe": [
            "stripe_api_blocker", "stripe_vendor_status",
            "stripe_relationship", "vendor_management",
        ],
        "vendor": [
            "stripe_vendor_status", "vendor_management", "vendor_contracts",
            "vendor_evaluation_pipeline",
        ],
        "contract": ["vendor_contracts", "stripe_msa_sla", "vendor_management"],
        "sprint": [
            "sprint_14_progress", "sprint_progress", "sprint_velocity",
        ],
        "velocity": ["sprint_velocity", "sprint_progress"],
        "deploy": ["deployment_pipeline", "deployment"],
        "infrastructure": ["infrastructure_costs", "infrastructure"],
        "feature": [
            "feature_roadmap", "feature_status", "feature_prioritization",
            "product_roadmap",
        ],
        "roadmap": ["product_roadmap", "feature_roadmap"],
        "launch": [
            "launch_criteria_checklist", "launch_criteria",
            "marketplace_redesign_status", "product_launch", "launch_status",
        ],
        "product launch": [
            "product_launch", "launch_status", "launch_criteria",
            "marketplace_redesign_status",
        ],
        "onboarding": [
            "seller_onboarding_funnel", "seller_onboarding",
            "new_seller_setup", "seller_experience",
        ],
        "seller": [
            "seller_onboarding_funnel", "seller_onboarding",
            "seller_experience", "seller_churn_retention",
        ],
        "support": [
            "support_ticket_breakdown", "support_tickets",
            "customer_support", "support_backlog",
        ],
        "ticket": [
            "support_ticket_breakdown", "support_tickets",
            "support_backlog_risk", "support_backlog", "ticket_backlog",
        ],
        "backlog": [
            "support_ticket_breakdown", "support_backlog",
            "support_backlog_risk", "ticket_backlog",
        ],
        "kpi": ["company_kpis", "kpis"],
        "hiring": ["hiring_pipeline", "hiring", "q2_ops_hiring_plan"],
        "q2": ["q2_priorities", "q2_planning"],
        "budget": ["budget_allocation", "budget", "company_kpis"],
        "burn": ["budget_allocation", "budget"],
        "okr": ["company_okrs_q2", "okrs", "q2_priorities"],
        "risk": [
            "q2_risks", "risks", "blockers", "stripe_api_blocker",
            "q2_priorities",
        ],
        "at risk": ["q2_risks", "risks", "blockers", "q2_priorities"],
        "tech debt": ["tech_debt_auth_module", "tech_debt"],
        "timeline": ["q2_priorities", "board_review_prep"],
        "board": ["board_review_prep", "board_reporting"],
        "escalation": [
            "cross_team_escalation_process", "cross_team_escalation",
        ],
        "ci/cd": ["cicd_migration", "cicd_pipeline"],
        "pipeline": ["cicd_migration", "cicd_pipeline"],
        "incident": ["incident_response_sop", "incident_response"],
        "code review": ["code_review_turnaround", "code_review"],
        "kyc": ["kyc_compliance_deadline", "kyc_compliance"],
        "compliance": ["kyc_compliance_deadline", "kyc_compliance"],
        "adoption": ["feature_adoption_metrics", "feature_adoption"],
        "design system": ["design_system_migration"],
        "triage": ["feature_request_triage"],
        "success program": ["seller_success_program"],
        "ops hiring": ["q2_ops_hiring_plan", "q2_ops_hiring"],
        "notify": ["q2_priorities", "board_review_prep"],
        "heads up": ["q2_priorities"],
        "competitor": [
            "competitor_landscape", "competitors",
            "competitive_product_intel", "competitive_intel",
        ],
        "vendora": [
            "competitor_landscape", "competitors",
            "competitive_product_intel",
        ],
        "nps": ["seller_survey_march", "seller_survey"],
        "survey": ["seller_survey_march", "seller_survey"],
        "a/b": ["ab_test_listing_flow", "ab_test"],
        "test": ["ab_test_listing_flow", "ab_test"],
        "churn": ["seller_churn_retention", "seller_churn"],
        "retention": ["seller_churn_retention", "seller_churn"],
        "dispute": ["refund_dispute_rates", "refund_disputes"],
        "refund": ["refund_dispute_rates", "refund_disputes"],
        "fulfillment": ["warehouse_fulfillment_status", "fulfillment"],
        "shipping": [
            "warehouse_fulfillment_status", "fulfillment", "warehouse",
        ],
        "warehouse": ["warehouse_fulfillment_status", "warehouse"],
        "zendesk": ["vendor_evaluation_pipeline", "vendor_evaluation"],
        "intercom": ["vendor_evaluation_pipeline", "vendor_evaluation"],
        "persona": ["vendor_evaluation_pipeline", "vendor_evaluation"],
        "security": [
            "security_audit_status", "security_audit",
            "tech_debt_auth_module",
        ],
        "audit": ["security_audit_status", "security_audit"],
        "soc": ["security_audit_status", "security_audit"],
        "uptime": ["platform_performance", "performance"],
        "latency": ["platform_performance", "performance"],
        "performance": ["platform_performance", "performance"],
        "capacity": ["team_capacity", "team_bandwidth"],
        "bandwidth": ["team_capacity", "team_bandwidth"],
        "intern": ["team_capacity", "team_bandwidth"],
        # Person names → their domain keys
        "alex": [
            "stripe_vendor_status", "vendor_management", "seller_onboarding_funnel",
            "support_ticket_breakdown", "kyc_compliance_deadline",
        ],
        "jordan": [
            "marketplace_redesign_status", "sprint_14_progress",
            "feature_roadmap", "launch_criteria_checklist",
        ],
        "sam": [
            "stripe_api_blocker", "sprint_velocity", "deployment_pipeline",
            "infrastructure_costs", "cicd_migration",
        ],
        "riley": ["q2_priorities", "company_kpis", "hiring_pipeline", "board_review_prep"],
        # Action words that should map to relevant context
        "working on": ["q2_priorities", "sprint_progress"],
        "been doing": ["q2_priorities", "sprint_progress"],
        "resolve": ["stripe_api_blocker", "blockers", "api_dependencies"],
        "fix": ["stripe_api_blocker", "blockers", "tech_debt_auth_module"],
        "need to do": ["stripe_api_blocker", "blockers"],
    }

    for keyword, keys in keyword_map.items():
        if keyword in q_lower:
            for k in keys:
                if k in available_keys and k not in selected:
                    selected.append(k)

    base["selected_keys"] = selected[:3]
    return base


# ---------------------------------------------------------------------------
# New multi-agent query functions
# ---------------------------------------------------------------------------

async def query_agent_with_entries(
    agent: Agent,
    question: str,
    requesting_role: str,
    relevant_topics: list[str] | None = None,
) -> dict:
    """Query an agent using structured KnowledgeEntry knowledge base.

    Args:
        agent: The agent to query.
        question: The user's question.
        requesting_role: Role of the requesting agent.
        relevant_topics: If provided, only collect references_agent from entries
            whose topic is in this list. Prevents unrelated second-hop chaining.

    Returns dict with content, references (agent IDs), agent_name, agent_role.
    """
    # Build knowledge base text from entries
    entries = agent.knowledge_entries
    if entries:
        kb_lines = []
        for e in entries:
            if isinstance(e, dict):
                vis = e.get("visibility", "public")
                if vis in ("public", "team"):
                    kb_lines.append(
                        f"[{e['topic']} | {e['category']}] "
                        f"{e['content']} (updated: {e['last_updated']})"
                    )
            else:
                vis = getattr(e, "visibility", "public")
                if vis in ("public", "team"):
                    kb_lines.append(
                        f"[{e.topic} | {e.category}] "
                        f"{e.content} (updated: {e.last_updated})"
                    )
        kb_text = "\n".join(kb_lines)
    else:
        kb_text = agent.knowledge_base or "No knowledge available."

    prompt = f"""You are the AI agent for {agent.name}, {agent.role}.

Your knowledge base (this is ALL the information you have):
{kb_text}

The COO's agent is asking on behalf of {requesting_role}: "{question}"

CRITICAL RULES:
- ONLY use facts from your knowledge base above. Do NOT invent names, people, \
teams, numbers, dates, or events that are not explicitly listed above.
- If the question asks about something not in your knowledge base, say "I don't \
have information on that" — do NOT make up an answer.
- Answer with specific facts, numbers, and dates from your knowledge base.
- If something is blocked or at risk, say so directly with the reason.
- If another team or person has relevant info you don't have, name them only if \
they appear in your knowledge base.
- Be concise and factual. No filler. Under 80 words."""

    if get_active_provider() != "mock":
        result = await call_llm(system=prompt, user_message=question, model_tier="reasoning")
        if result is not None:
            content = result
        else:
            content = _mock_query_agent(agent, question)
    else:
        content = _mock_query_agent(agent, question)

    # Collect all references_agent pointers from this agent's knowledge entries.
    # If this agent was selected for the query, all their cross-references are relevant.
    references = []
    if entries:
        for entry in entries:
            ref = (
                entry.get("references_agent") if isinstance(entry, dict)
                else getattr(entry, "references_agent", None)
            )
            if ref:
                references.append(ref)

    return {
        "content": content,
        "references": references,
        "agent_name": agent.name,
        "agent_role": agent.role,
        "agent_id": str(agent.id),
    }


async def synthesize_multi_agent_response(
    question: str,
    agent_responses: list[dict],
    conversation_history: list[str] | None = None,
) -> tuple[str, list[str], list[str]]:
    """Synthesize responses from multiple agents into one coherent answer.

    Always runs through the synthesis prompt, even for single-agent responses,
    to frame the answer from the COO's agent perspective.

    Returns (synthesized_text, source_roles, all_references_agent_ids).
    """
    if not agent_responses:
        return (
            "I checked across the team but nobody has information on that "
            "specific topic. Could you rephrase or give me a bit more context?",
            [],
            [],
        )

    # Build context for synthesis
    responses_text = "\n\n".join([
        f"{r['agent_role']} ({r['agent_name']}): {r['content']}"
        for r in agent_responses
    ])

    all_references = []
    for r in agent_responses:
        all_references.extend(r.get("references", []))

    history_context = ""
    if conversation_history:
        history_context = (
            f"\nRecent conversation context: "
            f"{'; '.join(conversation_history[-5:])}\n"
        )

    prompt = f"""You are Riley Chen's AI agent (COO). You checked with the team and got these responses:

{responses_text}
{history_context}
Synthesize into a clear, direct answer for Riley.

CRITICAL RULES:
- ONLY include information that appears in the agent responses above. Do NOT \
invent people, teams, events, meetings, or follow-ups that aren't mentioned.
- If an agent said "I don't have information on that", report that honestly — \
don't make up an answer to fill the gap.
- NEVER fabricate actions taken (like "I've confirmed with X" or "I reached out \
to Y") unless an agent explicitly said they did that.
- Lead with the most important fact or risk. Don't bury bad news.
- Include specific numbers, dates, and names ONLY from the responses above.
- If someone flagged a blocker or risk, highlight it clearly.
- If another team was referenced as having more info, mention them by name and \
offer to follow up (e.g., "I can check with Alex in Ops for the latest").
- Conversational tone — like a sharp executive briefing, not a report.
- Under 120 words. No headers, no bullet points, just clear prose."""

    if get_active_provider() != "mock":
        result = await call_llm(system=prompt, user_message=question, model_tier="reasoning")
        if result is not None:
            synthesized = result
        else:
            synthesized = _mock_synthesize(agent_responses)
    else:
        synthesized = _mock_synthesize(agent_responses)

    source_roles = [r["agent_role"] for r in agent_responses]
    return synthesized, source_roles, list(set(all_references))


async def stream_synthesis(
    question: str,
    agent_responses: list[dict],
    conversation_history: list[str] | None = None,
) -> AsyncGenerator[str, None]:
    """Stream the synthesis of multi-agent responses.

    Always runs through the synthesis prompt, even for single-agent responses,
    to frame the answer from the COO's agent perspective.
    """
    if not agent_responses:
        yield (
            "I checked across the team but nobody has information on that "
            "specific topic. Could you rephrase or give me a bit more context?"
        )
        return

    responses_text = "\n\n".join([
        f"{r['agent_role']} ({r['agent_name']}): {r['content']}"
        for r in agent_responses
    ])

    history_context = ""
    if conversation_history:
        history_context = (
            f"\nRecent conversation context: "
            f"{'; '.join(conversation_history[-5:])}\n"
        )

    system = f"""You are Riley Chen's AI agent (COO). You checked with the team and got these responses:

{responses_text}
{history_context}
Synthesize into a clear, direct answer for Riley. Rules:
- Lead with the most important fact or risk. Don't bury bad news.
- Include specific numbers, dates, and names when available.
- If someone flagged a blocker or risk, highlight it clearly.
- If another team was referenced as having more info, mention them by name and \
offer to follow up (e.g., "I can check with Alex in Ops for the latest").
- Conversational tone — like a sharp executive briefing, not a report.
- Under 120 words. No headers, no bullet points, just clear prose."""

    if get_active_provider() != "mock":
        yielded = False
        async for chunk in stream_llm(system=system, user_message=question):
            yielded = True
            yield chunk
        if yielded:
            return

    yield _mock_synthesize(agent_responses)


# ---------------------------------------------------------------------------
# Mock implementations — realistic canned responses for demo flows
# ---------------------------------------------------------------------------

# Keywords that signal finance-related queries
_FINANCE_KW = re.compile(
    r"(revenue|forecast|budget|financial|finance|board deck|expense|q[1-4]\b.*\b(number|budget|forecast))",
    re.IGNORECASE,
)
# Keywords that signal document/file requests
_DOC_KW = re.compile(
    r"(get me|send me|share|file|document|report|results|spreadsheet|pdf|xlsx|contract)",
    re.IGNORECASE,
)
# Keywords that signal marketplace/product queries
_PRODUCT_KW = re.compile(
    r"(marketplace|redesign|product|roadmap|feature|sprint|launch|design)",
    re.IGNORECASE,
)
# Keywords that signal engineering queries
_ENG_KW = re.compile(
    r"(api|dependency|dependencies|blocker|blocked|velocity|deploy|infrastructure|tech debt)",
    re.IGNORECASE,
)
# Keywords that signal operations queries
_OPS_KW = re.compile(
    r"(vendor|onboarding|seller|support|ticket|contract|sla|stripe|ops|operations)",
    re.IGNORECASE,
)


def _mock_classify_intent(message: str) -> str:
    if _DOC_KW.search(message):
        return "DOC_REQUEST"
    return "QUERY"


def _mock_classify_and_route(message: str) -> dict:
    msg_lower = message.lower()

    # Determine intent
    _NOTIFY_KW = re.compile(
        r"(let .* know|notify|inform|tell .* (about|that)|update .* about|heads up|give .* heads up)",
        re.IGNORECASE,
    )
    if _DOC_KW.search(message):
        intent = "action_request"
    elif _NOTIFY_KW.search(message):
        intent = "action_request"
    elif any(w in msg_lower for w in (
        "the blocker", "the dependency", "find out", "follow up",
        "why", "how do we", "what do we need", "how can we",
    )):
        intent = "follow_up"
    elif any(w in msg_lower for w in (
        "what has", "what is", "what's", "working on", "been doing",
        "status", "how's", "how is", "who is", "who's",
    )):
        intent = "information_query"
    else:
        intent = "information_query"

    # Extract a topic — match person names to their domains
    if "alex" in msg_lower or "ops" in msg_lower or "operations" in msg_lower:
        topic = "operations"
    elif "jordan" in msg_lower or "product" in msg_lower:
        topic = "product"
    elif "sam" in msg_lower or "engineering" in msg_lower or "eng " in msg_lower:
        topic = "engineering"
    elif "riley" in msg_lower or "ceo" in msg_lower or "board" in msg_lower:
        topic = "executive"
    elif "redesign" in msg_lower or "marketplace" in msg_lower or "on track" in msg_lower:
        topic = "marketplace redesign"
    elif "api" in msg_lower or "dependency" in msg_lower or "blocker" in msg_lower:
        topic = "api dependency"
    elif "vendor" in msg_lower or "contract" in msg_lower:
        topic = "vendor contract"
    elif "sprint" in msg_lower:
        topic = "sprint progress"
    elif "onboarding" in msg_lower or "seller" in msg_lower:
        topic = "seller onboarding"
    elif "stripe" in msg_lower:
        topic = "stripe"
    elif "support" in msg_lower or "ticket" in msg_lower:
        topic = "support"
    else:
        topic = "general inquiry"

    return {
        "intent": intent,
        "topic": topic,
        "summary": message,
    }


def _mock_query_agent(agent: Agent, question: str) -> str:
    """Return a realistic canned response based on agent role and question."""
    role_lower = agent.role.lower()
    q_lower = question.lower()

    if "product" in role_lower:
        if "redesign" in q_lower or "marketplace" in q_lower or "on track" in q_lower:
            return (
                "The marketplace redesign is partially on track. Designs are approved "
                "and the feature spec is finalized, but development hasn't started. "
                "Engineering is blocked on an API dependency from Stripe Connect. "
                "Target launch date is May 15, at risk if the blocker isn't resolved "
                "by April 7."
            )
        if "sprint" in q_lower:
            return (
                "Sprint 14: 8 of 12 story points completed, 2 tickets blocked on "
                "the API dependency. Sprint ends Friday."
            )
        return (
            "Top roadmap items: (1) redesigned seller dashboard — blocked, "
            "(2) bulk listing tool — in development, (3) buyer review overhaul — "
            "design phase."
        )

    if "engineering" in role_lower:
        if "api" in q_lower or "dependency" in q_lower or "blocker" in q_lower:
            return (
                "Engineering is blocked on API documentation from Stripe Connect for "
                "seller payouts. Docs were expected March 26 and still haven't arrived. "
                "This is the critical path blocker for the marketplace redesign. "
                "Operations manages the vendor relationship and may have a status update."
            )
        if "velocity" in q_lower or "sprint" in q_lower:
            return (
                "Sprint 14 velocity: 8/12 points (67%). One engineer out sick. "
                "Normal velocity is 11-12 points/sprint without blockers."
            )
        return (
            "Monthly infra cost: $8,400 (up 12% from Q1). Next planned deploy: "
            "April 4, contingent on API docs arriving."
        )

    if "operations" in role_lower:
        if "vendor" in q_lower or "stripe" in q_lower or "api" in q_lower:
            return (
                "Stripe Connect confirmed API documentation will be delivered Thursday, "
                "April 2. New contact assigned: Marcus Webb. Follow-up call scheduled "
                "for Thursday morning. The MSA includes a 30-day SLA for doc delivery — "
                "SLA breach as of April 4 if not delivered."
            )
        if "contract" in q_lower:
            return (
                "The Stripe Connect Master Service Agreement was signed March 1, 2026. "
                "It contains SLA terms for documentation delivery within 30 days."
            )
        if "onboarding" in q_lower or "seller" in q_lower:
            return (
                "Seller onboarding funnel: 180 applications, 110 approved, 68 activated "
                "(62% rate). Top drop-off: payout setup step — 40% stall there due to "
                "Stripe Connect UI friction."
            )
        return (
            "Support queue: 340 open tickets (up 21% MoM). Top categories: payout "
            "issues (38%), listing errors (24%), account verification (18%)."
        )

    # COO fallback
    return (
        "Q2 priorities: marketplace redesign launch, seller expansion to 500 active "
        "sellers, infrastructure cost reduction 15%. Board review April 14."
    )


def _mock_synthesize(agent_responses: list[dict]) -> str:
    """Mock synthesis of multi-agent responses with COO framing."""
    if len(agent_responses) == 1:
        resp = agent_responses[0]
        name = resp.get("agent_name", "the team")
        content = resp["content"]
        has_references = bool(resp.get("references"))
        framed = f"I checked with {name}. {content}"
        if has_references:
            framed += (
                " I can check with Alex in Operations for the latest "
                "on the vendor timeline if you'd like."
            )
        return framed

    # Multi-agent: weave together naturally
    names = [r.get("agent_name", r.get("agent_role")) for r in agent_responses]
    intro = f"I checked with {', '.join(names[:-1])} and {names[-1]}. "

    parts = []
    for r in agent_responses:
        # Take first 2 sentences
        sentences = r["content"].split(". ")
        parts.append(". ".join(sentences[:2]) + ".")

    combined = intro + " ".join(parts)

    # Check for references
    has_references = any(r.get("references") for r in agent_responses)
    if has_references:
        combined += (
            " I can check with Alex in Operations for the latest "
            "on the vendor timeline if you'd like."
        )

    return combined


def _mock_process_message(agent: Agent, message: str) -> str:
    """Return a realistic canned response based on agent persona and message content."""
    return _mock_query_agent(agent, message)


def _build_system_prompt(agent: Agent) -> str:
    """Build a system prompt that encodes the agent's persona and knowledge."""
    # Use knowledge entries if available, otherwise fall back to knowledge_base
    entries = agent.knowledge_entries
    if entries:
        kb_lines = []
        for e in entries:
            if isinstance(e, dict):
                vis = e.get("visibility", "public")
                if vis in ("public", "team"):
                    kb_lines.append(
                        f"- [{e['topic']}] {e['content']} (updated: {e['last_updated']})"
                    )
            else:
                vis = getattr(e, "visibility", "public")
                if vis in ("public", "team"):
                    kb_lines.append(
                        f"- [{e.topic}] {e.content} (updated: {e.last_updated})"
                    )
        kb_text = "\n".join(kb_lines)
    else:
        kb_text = agent.knowledge_base

    return f"""You are an AI agent acting on behalf of {agent.name}.

Role: {agent.role}
{agent.role_description}
Departments: {', '.join(agent.departments)}
Knowledge areas: {', '.join(agent.knowledge_areas)}

You have access to the following information:
{kb_text}

Respond helpfully and accurately based on your role and knowledge. If you don't have
the information requested, say so clearly. Keep responses concise and professional.
Keep responses under 100 words."""
