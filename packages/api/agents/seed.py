"""Demo seed data — initial agents loaded into the database on first boot."""

from uuid import UUID

# Fixed UUIDs so they're stable across restarts
SALES_AGENT_ID = UUID("00000000-0000-0000-0000-000000000001")
FINANCE_AGENT_ID = UUID("00000000-0000-0000-0000-000000000002")

SEED_AGENTS = [
    {
        "id": SALES_AGENT_ID,
        "name": "Jordan Chen",
        "role": "Senior Sales Representative",
        "department": "Sales",
        "knowledge_areas": ["pipeline", "accounts", "revenue targets", "client relationships"],
        "knowledge_base": (
            "- Manages enterprise accounts in the West region\n"
            "- Current Q4 pipeline: $2.4M across 12 deals\n"
            "- Largest deal: Acme Corp expansion ($450K, closing next week)\n"
            "- Reports to VP Sales (Dana Martinez)\n"
            "- Knows: who owns which accounts, deal stages, revenue forecasts\n"
            "- Has access to: CRM data, sales decks, pricing sheets, contract templates"
        ),
        "scopes": ["read:public", "read:sales", "write:sales"],
    },
    {
        "id": FINANCE_AGENT_ID,
        "name": "Karen Park",
        "role": "Finance Analyst",
        "department": "Finance",
        "knowledge_areas": ["financial reporting", "budgets", "forecasting", "revenue recognition"],
        "knowledge_base": (
            "- Owns Q4 revenue forecast and financial reporting\n"
            "- Manages departmental budget tracking\n"
            "- Prepares monthly close reports and board deck financials\n"
            "- Reports to CFO (Michael Torres)\n"
            "- Knows: revenue numbers, budget allocations, expense approvals, forecast models\n"
            "- Has access to: financial reports, budget spreadsheets, forecast models, board deck data\n"
            '- Key file: "Q4_Revenue_Forecast_2026.xlsx" (last updated March 10)\n'
            '- Key file: "FY2026_Budget_Tracker.xlsx"\n'
            '- Key file: "Focus_Group_Results_March2026.pdf"'
        ),
        "scopes": ["read:public", "read:finance", "write:finance"],
    },
]
