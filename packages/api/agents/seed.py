"""Demo seed data — two hardcoded agents for Phase 0."""

from uuid import UUID

from agents.models import Agent

# Fixed UUIDs so they're stable across restarts
SALES_AGENT_ID = UUID("00000000-0000-0000-0000-000000000001")
FINANCE_AGENT_ID = UUID("00000000-0000-0000-0000-000000000002")

sales_agent = Agent(
    id=SALES_AGENT_ID,
    name="Jordan Chen",
    role="Senior Sales Representative",
    departments=["Sales"],
    knowledge_areas=["pipeline", "accounts", "revenue targets", "client relationships"],
    knowledge_base="""
    - Manages enterprise accounts in the West region
    - Current Q4 pipeline: $2.4M across 12 deals
    - Largest deal: Acme Corp expansion ($450K, closing next week)
    - Reports to VP Sales (Dana Martinez)
    - Knows: who owns which accounts, deal stages, revenue forecasts
    - Has access to: CRM data, sales decks, pricing sheets, contract templates
    """,
    scopes=["read:public", "read:sales", "write:sales"],
)

finance_agent = Agent(
    id=FINANCE_AGENT_ID,
    name="Karen Park",
    role="Finance Analyst",
    departments=["Finance"],
    knowledge_areas=["financial reporting", "budgets", "forecasting", "revenue recognition"],
    knowledge_base="""
    - Owns Q4 revenue forecast and financial reporting
    - Manages departmental budget tracking
    - Prepares monthly close reports and board deck financials
    - Reports to CFO (Michael Torres)
    - Knows: revenue numbers, budget allocations, expense approvals, forecast models
    - Has access to: financial reports, budget spreadsheets, forecast models, board deck data
    - Key file: "Q4_Revenue_Forecast_2026.xlsx" (last updated March 10)
    - Key file: "FY2026_Budget_Tracker.xlsx"
    - Key file: "Focus_Group_Results_March2026.pdf"
    """,
    scopes=["read:public", "read:finance", "write:finance"],
)

DEMO_AGENTS: dict[UUID, Agent] = {
    SALES_AGENT_ID: sales_agent,
    FINANCE_AGENT_ID: finance_agent,
}
