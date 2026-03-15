"""Basic agent tests."""

from agents.models import Agent
from agents.seed import DEMO_AGENTS, SALES_AGENT_ID, FINANCE_AGENT_ID


def test_demo_agents_exist():
    assert len(DEMO_AGENTS) == 2
    assert SALES_AGENT_ID in DEMO_AGENTS
    assert FINANCE_AGENT_ID in DEMO_AGENTS


def test_sales_agent_persona():
    agent = DEMO_AGENTS[SALES_AGENT_ID]
    assert agent.department == "Sales"
    assert "pipeline" in agent.knowledge_areas


def test_finance_agent_persona():
    agent = DEMO_AGENTS[FINANCE_AGENT_ID]
    assert agent.department == "Finance"
    assert "financial reporting" in agent.knowledge_areas
