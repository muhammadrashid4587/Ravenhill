"""
Agent Runtime — the core execution engine for each employee's agent.

Each agent instance:
- Has a persona (role, department, knowledge areas)
- Calls Claude for reasoning (Haiku for routing, Sonnet for complex tasks)
- Executes tools on behalf of the employee
- Sends/receives messages through ETO
"""

import anthropic

from config import settings
from agents.models import Agent, AgentMessage


client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

ROUTING_MODEL = "claude-haiku-4-5-20251001"
REASONING_MODEL = "claude-sonnet-4-5-20250514"


async def process_message(agent: Agent, message: str) -> str:
    """Process an incoming message using the agent's persona and Claude."""
    system_prompt = _build_system_prompt(agent)

    response = await client.messages.create(
        model=REASONING_MODEL,
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": message}],
    )

    return response.content[0].text


async def classify_intent(message: str) -> str:
    """Use Haiku to quickly classify the intent of an incoming message."""
    response = await client.messages.create(
        model=ROUTING_MODEL,
        max_tokens=100,
        system="Classify the intent of this message. Respond with one of: QUERY, DOC_REQUEST, ACTION, BROADCAST",
        messages=[{"role": "user", "content": message}],
    )

    return response.content[0].text.strip()


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
