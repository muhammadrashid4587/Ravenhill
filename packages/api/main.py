from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from activity.router import router as activity_router
from agents.router import router as agents_router
from auth.router import router as auth_router
from capabilities.router import router as capabilities_router
from registry.router import router as registry_router
from messaging.router import router as messaging_router
from approvals.router import router as approvals_router
from events.router import router as events_router
from graph.router import router as graph_router
from integrations.slack.router import router as slack_router
from integrations.workspace.router import router as workspace_router
from meetings.router import router as meetings_router
from orchestrator import router as orchestrator_router
from orgs.router import router as orgs_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    from db import (
        alter_table_if_needed,
        close_db,
        init_db,
        seed_default_org,
    )

    print("Starting Ravenhill API...")
    # Order matters:
    #   1. init_db()           — create tables (organizations, agents, ...).
    #   2. seed_default_org()  — the org row exists for FK targets (the
    #      default org is just a container — NO demo agents live in it
    #      anymore. Real users always end up in their own workspace).
    #   3. alter_table_if_needed() — add columns on existing prod
    #      tables, backfill NULLs to the default org, swap constraints.
    #
    # Demo agents (Riley/Jordan/Sam/Alex) were removed: real customers
    # never see them, and a real user opening the app should see only
    # their actual teammates.
    await init_db()
    await seed_default_org()
    await alter_table_if_needed()
    yield
    await close_db()
    print("Shutting down Ravenhill API...")


app = FastAPI(
    title="Ravenhill API",
    description="Per-employee autonomous agents for enterprise",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "https://raven-hill.org",
        "https://www.raven-hill.org",
        "https://ravenhillai.com",
        "https://www.ravenhillai.com",
        "https://ravenhill-api.fly.dev",
    ],
    # Match every Vercel preview/production URL on this project so the
    # frontend can talk to the API regardless of which preview it's on.
    allow_origin_regex=r"https://raven-hill(-[a-z0-9]+)?(-muhammad-rashids-projects-[a-z0-9]+)?\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(activity_router, prefix="/api/activity", tags=["activity"])
app.include_router(agents_router, prefix="/api/agents", tags=["agents"])
app.include_router(registry_router, prefix="/api/registry", tags=["registry"])
app.include_router(messaging_router, prefix="/api/messages", tags=["messaging"])
app.include_router(approvals_router, prefix="/api/approvals", tags=["approvals"])
app.include_router(events_router, prefix="/api/events", tags=["events"])
app.include_router(graph_router, prefix="/api/graph", tags=["graph"])
app.include_router(slack_router, prefix="/api/integrations/slack", tags=["integrations"])
app.include_router(workspace_router, prefix="/api/workspace", tags=["workspace"])
app.include_router(meetings_router, prefix="/api/meetings", tags=["meetings"])
app.include_router(orchestrator_router, prefix="/api/orchestrate", tags=["orchestrator"])
app.include_router(orgs_router, prefix="/api/orgs", tags=["orgs"])
app.include_router(capabilities_router, prefix="/api/capabilities", tags=["capabilities"])


@app.get("/health")
async def health():
    from agents.llm_providers import get_active_provider
    return {"status": "ok", "service": "ravenhill-api", "llm_provider": get_active_provider()}
