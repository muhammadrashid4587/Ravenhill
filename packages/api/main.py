from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from activity.router import router as activity_router
from agents.router import router as agents_router
from registry.router import router as registry_router
from messaging.router import router as messaging_router
from approvals.router import router as approvals_router
from events.router import router as events_router
from meetings.router import router as meetings_router
from orchestrator import router as orchestrator_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    from db import init_db, alter_table_if_needed, seed_demo_agents, close_db

    print("Starting Ravenhill API...")
    await init_db()
    await alter_table_if_needed()
    await seed_demo_agents()
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
        "https://e-agent-demo.fly.dev",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(activity_router, prefix="/api/activity", tags=["activity"])
app.include_router(agents_router, prefix="/api/agents", tags=["agents"])
app.include_router(registry_router, prefix="/api/registry", tags=["registry"])
app.include_router(messaging_router, prefix="/api/messages", tags=["messaging"])
app.include_router(approvals_router, prefix="/api/approvals", tags=["approvals"])
app.include_router(events_router, prefix="/api/events", tags=["events"])
app.include_router(meetings_router, prefix="/api/meetings", tags=["meetings"])
app.include_router(orchestrator_router, prefix="/api/orchestrate", tags=["orchestrator"])


@app.get("/health")
async def health():
    from agents.llm_providers import get_active_provider
    return {"status": "ok", "service": "ravenhill-api", "llm_provider": get_active_provider()}
