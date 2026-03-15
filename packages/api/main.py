from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agents.router import router as agents_router
from registry.router import router as registry_router
from messaging.router import router as messaging_router
from approvals.router import router as approvals_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize DB pool, Redis, ETO connection
    print("Starting e-agent API...")
    yield
    # Shutdown: cleanup connections
    print("Shutting down e-agent API...")


app = FastAPI(
    title="e-agent API",
    description="Per-employee autonomous agents for enterprise",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents_router, prefix="/api/agents", tags=["agents"])
app.include_router(registry_router, prefix="/api/registry", tags=["registry"])
app.include_router(messaging_router, prefix="/api/messages", tags=["messaging"])
app.include_router(approvals_router, prefix="/api/approvals", tags=["approvals"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "e-agent-api"}
