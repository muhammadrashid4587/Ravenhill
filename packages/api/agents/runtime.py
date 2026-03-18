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
import re

from agents.models import Agent
from agents.llm_providers import call_llm, get_active_provider


async def process_message(agent: Agent, message: str) -> str:
    """Process an incoming message using the agent's persona and an LLM."""
    if get_active_provider() != "mock":
        system_prompt = _build_system_prompt(agent)
        result = await call_llm(system=system_prompt, user_message=message, model_tier="reasoning")
        if result is not None:
            return result

    return _mock_process_message(agent, message)


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
- "intent": one of "QUERY", "DOC_REQUEST", "ACTION", "BROADCAST"
- "department": the department most likely to OWN the answer — must be one of "Sales" or "Finance"
- "topic": a short topic label (e.g., "revenue forecast", "deal status")
- "summary": a one-sentence summary of what is being asked

Department guidance:
- "Finance" owns: revenue forecasts, budgets, financial reports, board decks, expense approvals, focus group results
- "Sales" owns: deal pipeline, account management, client relationships, CRM data, pricing, contracts

Rules:
- If the message asks for a file, document, report, or results, intent is "DOC_REQUEST"
- If the message asks a question about information, intent is "QUERY"
- If the message asks to perform an action, intent is "ACTION"
- Otherwise, intent is "BROADCAST"

Respond ONLY with valid JSON. No other text."""


async def classify_and_route(message: str) -> dict:
    """Use a fast model to classify intent AND extract routing info as structured JSON.

    Returns dict with keys: intent, department, topic, summary
    """
    if get_active_provider() != "mock":
        raw = await call_llm(
            system=_CLASSIFY_ROUTE_SYSTEM,
            user_message=message,
            model_tier="fast",
            max_tokens=200,
            json_mode=True,
        )
        if raw is not None:
            raw = raw.strip()
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                start = raw.find("{")
                end = raw.rfind("}") + 1
                if start >= 0 and end > start:
                    return json.loads(raw[start:end])
                return {
                    "intent": "QUERY",
                    "department": "unknown",
                    "topic": "unknown",
                    "summary": message,
                }

    return _mock_classify_and_route(message)


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
    r"(get me|send me|share|file|document|report|results|spreadsheet|pdf|xlsx)",
    re.IGNORECASE,
)
# Keywords that signal sales-related queries
_SALES_KW = re.compile(
    r"(pipeline|deal|account|acme|client|sales|crm|pricing|contract|prospect)",
    re.IGNORECASE,
)


def _mock_classify_intent(message: str) -> str:
    if _DOC_KW.search(message):
        return "DOC_REQUEST"
    return "QUERY"


def _mock_classify_and_route(message: str) -> dict:
    msg_lower = message.lower()

    # Determine intent
    if _DOC_KW.search(message):
        intent = "DOC_REQUEST"
    else:
        intent = "QUERY"

    # Determine department
    if _FINANCE_KW.search(message):
        department = "Finance"
    elif _SALES_KW.search(message):
        department = "Sales"
    else:
        # Default to Finance for unknown — makes demo routing more interesting
        department = "Finance"

    # Extract a topic
    topic_map = {
        "revenue": "revenue forecast",
        "forecast": "revenue forecast",
        "budget": "budget tracking",
        "focus group": "focus group results",
        "acme": "deal status",
        "pipeline": "sales pipeline",
        "deal": "deal status",
        "account": "account management",
        "board deck": "board deck financials",
        "expense": "expense approvals",
    }
    topic = "general inquiry"
    for kw, t in topic_map.items():
        if kw in msg_lower:
            topic = t
            break

    return {
        "intent": intent,
        "department": department,
        "topic": topic,
        "summary": message,
    }


# Canned responses keyed by (department, topic keywords)
_JORDAN_RESPONSES = {
    "acme": (
        "The Acme Corp expansion deal is currently at $450K and is on track to close next week. "
        "I've been working closely with their VP of Engineering on the enterprise tier upgrade. "
        "All contract terms are finalized — just waiting on their legal review."
    ),
    "pipeline": (
        "Our Q4 pipeline is looking strong at $2.4M across 12 active deals. "
        "The top 3 by value are: Acme Corp ($450K), Globex ($320K), and Initech ($280K). "
        "We're tracking 8 deals in negotiation stage and 4 in proposal stage."
    ),
    "deal": (
        "I'm currently managing 12 deals in the West region pipeline. "
        "The biggest opportunity is the Acme Corp expansion at $450K. "
        "Would you like me to break down the deals by stage?"
    ),
    "account": (
        "I manage enterprise accounts in the West region. Key accounts include "
        "Acme Corp, Globex, Initech, and Umbrella Corp. My total portfolio value "
        "is $2.4M in active pipeline."
    ),
    "client": (
        "My primary client relationships are in the West region enterprise segment. "
        "Acme Corp is our largest active deal. I can provide detailed account "
        "information for any specific client."
    ),
}

_KAREN_RESPONSES = {
    "revenue": (
        "I own the Q4 revenue forecast. Current projections show $8.2M in recognized "
        "revenue, up 12% from Q3. The forecast model was last updated on March 10. "
        "Key drivers are the enterprise segment growth and the new mid-market expansion."
    ),
    "forecast": (
        "The Q4 revenue forecast projects $8.2M, which is tracking 3% above plan. "
        "I update the forecast model weekly — the latest version is in "
        "Q4_Revenue_Forecast_2026.xlsx, last updated March 10."
    ),
    "budget": (
        "Q4 budget allocation across departments: Engineering $2.1M, Sales $1.8M, "
        "Marketing $950K, Operations $620K. We're currently 4% under total budget. "
        "I track this in FY2026_Budget_Tracker.xlsx."
    ),
    "financial": (
        "Our financial position for Q4 is healthy. Revenue is tracking above plan, "
        "expenses are 4% under budget, and cash runway is 18 months. "
        "Monthly close reports are current through February."
    ),
    "board deck": (
        "The board deck financials are ready through February. Key highlights: "
        "12% revenue growth QoQ, 68% gross margin, and $18M ARR run rate. "
        "I'll have March numbers ready by the 15th."
    ),
    "expense": (
        "I handle expense approvals for amounts over $5K. Current pending approvals: "
        "3 requests totaling $28K. Average approval turnaround is 2 business days."
    ),
    "focus group": (
        "The focus group results from March 2026 are compiled in "
        "Focus_Group_Results_March2026.pdf. Key findings: 82% of enterprise users "
        "want AI-assisted workflows, and 71% prioritize data privacy controls."
    ),
}


def _mock_process_message(agent: Agent, message: str) -> str:
    """Return a realistic canned response based on agent persona and message content."""
    msg_lower = message.lower()

    responses = _KAREN_RESPONSES if agent.department == "Finance" else _JORDAN_RESPONSES

    for keyword, response in responses.items():
        if keyword in msg_lower:
            return response

    # Generic fallback per agent
    if agent.department == "Finance":
        return (
            f"As {agent.name}, Finance Analyst, I can help with financial reporting, "
            f"budgets, forecasting, and revenue recognition. Could you be more specific "
            f"about what financial information you need?"
        )
    return (
        f"As {agent.name}, Senior Sales Rep, I manage enterprise accounts in the West "
        f"region with a $2.4M pipeline across 12 deals. What specific sales information "
        f"can I help you with?"
    )


def _build_system_prompt(agent: Agent) -> str:
    """Build a system prompt that encodes the agent's persona and knowledge."""
    return f"""You are an AI agent acting on behalf of {agent.name}.

Role: {agent.role}
Department: {agent.department}
Knowledge areas: {', '.join(agent.knowledge_areas)}

You have access to the following information:
{agent.knowledge_base}

Respond helpfully and accurately based on your role and knowledge. If you don't have
the information requested, say so clearly. Keep responses concise and professional."""
