# CLAUDE.md — Ravenhill

## What This Is

Ravenhill (repo: `e-agent`) is a per-employee AI agent platform for enterprise. Every employee gets a personal agent; agents talk to each other to handle work that currently requires human chains (questions, file requests, status updates). ETO (eto.markets) is the inter-agent communication backbone for messaging, payments, and file transfer.

**Stage**: Pre-seed, Phase 0 (demo build). Ship date: March 27, 2026.
**Team**: Muhammad (CTO, sole engineer), Max (CEO), Likitha (COO/QA).

---

## Repo Structure

Monorepo with three packages:

```
e-agent/
├── packages/
│   ├── api/              # Python/FastAPI backend (the core)
│   │   ├── agents/       # Agent runtime, LLM providers, personas, seed data
│   │   ├── orchestrator.py  # The brain: classify → route → answer/approve
│   │   ├── registry/     # Agent discovery (keyword match now, pgvector later)
│   │   ├── messaging/    # Inter-agent message models, ETO client stub
│   │   ├── approvals/    # Human-in-the-loop approval flows
│   │   ├── permissions/  # RBAC, scope checks, approval requirements
│   │   ├── admin/        # Admin control plane (Phase 2, stubs only)
│   │   ├── integrations/ # SaaS connectors (Phase 1+, empty)
│   │   ├── tests/        # pytest tests
│   │   ├── config.py     # Pydantic settings from .env
│   │   └── main.py       # FastAPI app, CORS, router mounts
│   ├── web/              # TypeScript/React/Next.js frontend
│   │   ├── src/app/      # Next.js app router (page.tsx, demo/page.tsx)
│   │   ├── src/components/  # ChatMessage, ApprovalPopup
│   │   └── src/lib/api.ts   # API client functions
│   └── shared/           # Shared types (placeholder, empty)
├── infra/                # Dockerfile.api, fly.toml
├── scripts/              # dev.sh (starts full stack)
├── docs/                 # Architecture docs
├── .github/workflows/    # CI/CD: lint + test + deploy to Fly.io
├── docker-compose.yml    # Postgres (pgvector) + Redis for local dev
├── .env.example          # Environment variable template
├── TECHNICAL_PLAN.md     # Full architecture and phase plan
└── IMPLEMENTATION_PLAN.md  # Day-by-day 2-week sprint breakdown
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11+, FastAPI, Uvicorn, Pydantic |
| LLM | Claude API (Haiku for routing, Sonnet for reasoning), Groq/Gemini fallbacks, mock mode |
| Frontend | TypeScript, React 18, Next.js 14.2, Tailwind CSS 3.4 |
| Database | PostgreSQL 16 + pgvector (via Docker, not yet used in code) |
| Cache | Redis 7 (via Docker, not yet used in code) |
| Inter-agent | ETO (stubbed, real integration Week 2) |
| Deploy | Fly.io, GitHub Actions CI/CD |
| Lint | Ruff (Python), ESLint (TypeScript) |
| Test | pytest + pytest-asyncio |

---

## Dev Commands

### Full stack
```bash
./scripts/dev.sh              # Starts Docker (Postgres+Redis) + API + Web
```

### Backend (from repo root)
```bash
cd packages/api
pip install -e ".[dev]"       # Install with dev deps
uvicorn main:app --reload --port 8000   # Run API server
pytest tests/ -v              # Run tests
ruff check .                  # Lint
```

### Frontend (from repo root)
```bash
cd packages/web
npm install                   # Install deps
npm run dev                   # Dev server on :3000
npm run build                 # Production build
npm run lint                  # ESLint
```

### Infrastructure
```bash
docker compose up -d          # Start Postgres + Redis
docker compose down           # Stop
```

### Local URLs
- API: http://localhost:8000
- Web: http://localhost:3000
- API docs (Swagger): http://localhost:8000/docs

---

## Architecture Overview

### Two Demo Flows (Phase 0)

**Demo 1 — Knowledge Routing (QUERY)**:
1. User asks Jordan (Sales) a finance question
2. Orchestrator classifies intent via LLM (fast tier)
3. Registry finds Karen (Finance) as the expert
4. Karen's agent answers → response flows back through Jordan
5. UI shows each step progressively

**Demo 2 — Document Sharing (DOC_REQUEST)**:
1. User asks Jordan for a file owned by Karen's team
2. Same classify → route flow
3. Orchestrator creates an approval request
4. Karen's panel shows approval popup
5. Karen approves → file "delivered" → confirmation on both sides

### Key Components

- **Orchestrator** (`packages/api/orchestrator.py`): The brain. Classify → route → answer or create approval. Returns `OrchestrateResponse` with steps for UI visualization.
- **Agent Runtime** (`packages/api/agents/runtime.py`): Processes messages through LLM with persona-aware system prompts. Falls back to realistic mock responses.
- **LLM Providers** (`packages/api/agents/llm_providers.py`): Abstraction over Anthropic/Groq/Gemini with auto-fallback chain. Mock mode when no keys available.
- **Registry** (`packages/api/registry/router.py`): Agent discovery via keyword matching (pgvector semantic search planned for Phase 1).
- **Approvals** (`packages/api/approvals/router.py`): In-memory pending approvals store. Human-in-the-loop for file sharing.
- **Permissions** (`packages/api/permissions/engine.py`): RBAC scope checks. Phase 0: all file sharing requires approval.
- **Seed Data** (`packages/api/agents/seed.py`): Two hardcoded demo agents — Jordan Chen (Sales, UUID `00000001...`) and Karen Park (Finance, UUID `00000002...`).

### API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/orchestrate` | Full orchestration (classify → route → answer) |
| GET | `/api/orchestrate/approval/{id}/complete` | Complete doc request after approval |
| POST | `/api/orchestrate/reset` | Reset all demo state |
| GET | `/api/agents` | List all agents |
| GET | `/api/agents/{id}` | Get single agent |
| POST | `/api/agents/{id}/chat` | Direct chat with agent |
| GET | `/api/registry` | List all registered agents |
| GET | `/api/registry/search?query=...` | Search agents by keyword |
| POST | `/api/messages/send` | Send inter-agent message |
| POST | `/api/approvals/request` | Create approval |
| GET | `/api/approvals/pending` | List pending approvals |
| POST | `/api/approvals/{id}/decide` | Approve or deny |
| GET | `/health` | Health check |

---

## Code Conventions

### Python (packages/api)
- **Style**: Ruff-enforced, line-length 100, target Python 3.11
- **Async**: All endpoint handlers and LLM calls are `async`
- **Models**: Pydantic `BaseModel` for all request/response schemas
- **Structure**: Each module has `models.py`, `router.py`, and business logic files
- **Naming**: `snake_case` for functions/variables, `PascalCase` for classes/models
- **Imports**: Relative within package (`from agents.models import Agent`)
- **Type hints**: Use `dict | None` union syntax (3.10+), not `Optional`

### TypeScript/React (packages/web)
- **Framework**: Next.js 14.2 App Router (`src/app/`)
- **Style**: Tailwind utility classes, no component library
- **Components**: Functional components with hooks
- **State**: `useState` / `useRef` / `useEffect` (no external state management)
- **API calls**: Plain `fetch` with JSON, centralized in `src/lib/api.ts`
- **Imports**: `@/` alias for `src/` directory
- **Strict mode**: TypeScript strict enabled

### General
- No over-engineering. Build only what the demo needs.
- In-memory storage is fine for Phase 0. No database persistence yet.
- Mock mode is a first-class path — demo must work without any API keys.
- Every day should end with something demoable.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in. At minimum, set one LLM key or use `LLM_PROVIDER=mock`.

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `LLM_PROVIDER` | No | `auto` | `auto`, `anthropic`, `groq`, `gemini`, or `mock` |
| `ANTHROPIC_API_KEY` | No* | — | Required if using Anthropic |
| `GROQ_API_KEY` | No* | — | Required if using Groq |
| `GEMINI_API_KEY` | No* | — | Required if using Gemini |
| `DATABASE_URL` | No | `postgresql://eagent:eagent@localhost:5432/eagent` | Not actively used in Phase 0 |
| `REDIS_URL` | No | `redis://localhost:6379` | Not actively used in Phase 0 |
| `ETO_API_KEY` | No | — | ETO integration (stub) |
| `ETO_API_URL` | No | `https://api.eto.markets/v1` | ETO endpoint |
| `APP_ENV` | No | `development` | |
| `API_PORT` | No | `8000` | |
| `WEB_PORT` | No | `3000` | |

*At least one LLM key needed for real LLM responses. Without any, mock mode activates automatically.

---

## LLM Provider System

The LLM layer (`agents/llm_providers.py`) uses a two-tier model approach:
- **Fast tier** (`model_tier="fast"`): Haiku/Llama/Flash — used for intent classification and routing
- **Reasoning tier** (`model_tier="reasoning"`): Sonnet/Llama/Flash — used for generating agent responses

Auto-fallback order: Anthropic → Groq → Gemini → Mock. Providers are disabled for the session if auth/billing errors occur. Mock mode returns realistic canned responses tuned for the demo flows.

---

## Testing

```bash
cd packages/api && pytest tests/ -v
```

Tests use `pytest-asyncio` with `asyncio_mode = "auto"`. Test files:
- `tests/test_orchestrator.py` — orchestration flows, approval flows, routing logic (13 tests)
- `tests/test_agents.py` — agent persona validation (3 tests)

Tests run against mock mode (no API keys needed). CI runs `ruff check . && pytest tests/ -v` on every push to main.

---

## Deployment

- **CI/CD**: GitHub Actions (`.github/workflows/deploy.yml`) — push to main triggers lint → test → deploy
- **Hosting**: Fly.io (`infra/fly.toml`) — app name `e-agent-demo`, region `iad`
- **Docker**: `infra/Dockerfile.api` — Python 3.13 slim, uvicorn
- **Secrets**: Set via `fly secrets set` (API keys, etc.)
- **CORS**: Configured for `localhost:3000` and `e-agent-demo.fly.dev`

---

## Key Design Decisions

1. **ETO is the inter-agent backbone** — messaging, file transfers, payments all through ETO. We don't build our own messaging infra.
2. **Human-in-the-loop defaults to conservative** — all file sharing requires approval in Phase 0.
3. **Mock mode is first-class** — demo must work perfectly with zero API keys.
4. **Two-tier LLM calls** — fast model for classification, reasoning model for answers.
5. **Progressive step visualization** — orchestrator returns steps array so frontend can show the routing flow in real-time.
6. **No database in Phase 0** — agents are hardcoded seed data, approvals are in-memory dicts.

---

## Phase Roadmap (Context Only)

- **Phase 0** (now): Two-agent demo, knowledge routing + doc sharing, live on public URL
- **Phase 1** (Weeks 6-14): Single agent with real SaaS integrations (Google, Slack), knowledge base, voice
- **Phase 2** (Weeks 15-24): Multi-agent with admin control plane, org chart registry, full permissions, audit logging

---

## Working With This Codebase

- Read `TECHNICAL_PLAN.md` for the full architecture vision and phase breakdown.
- Read `IMPLEMENTATION_PLAN.md` for the day-by-day sprint plan.
- The orchestrator is the most important file — it ties everything together.
- When adding new agent capabilities, update both the runtime and the mock responses.
- Frontend API client is in `packages/web/src/lib/api.ts` — add new endpoints there.
- Test orchestration changes with `pytest tests/test_orchestrator.py -v`.
- The demo has a "Reset Demo" button/endpoint that clears all in-memory state.
