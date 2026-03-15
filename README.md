# e-agent

Every employee gets a personal AI agent. The agents talk to each other. Work that currently requires human chains happens instantly.

## Quick Start

```bash
# 1. Copy environment variables
cp .env.example .env
# Fill in your ANTHROPIC_API_KEY and ETO_API_KEY

# 2. Start infrastructure (Postgres + Redis)
docker compose up -d

# 3. Start the API server
cd packages/api
pip install -e ".[dev]"
uvicorn main:app --reload --port 8000

# 4. Start the web app (separate terminal)
cd packages/web
npm install
npm run dev
```

API docs: http://localhost:8000/docs

## Repo Structure

```
e-agent/
├── packages/
│   ├── api/              # FastAPI backend (Python)
│   │   ├── agents/       # Agent runtime + Claude integration
│   │   ├── messaging/    # ETO inter-agent communication
│   │   ├── registry/     # Agent discovery service
│   │   ├── approvals/    # Human-in-the-loop approval flows
│   │   ├── permissions/  # RBAC + IdP sync
│   │   ├── admin/        # Admin Control Plane (Phase 2)
│   │   └── integrations/ # SaaS connectors (Phase 1+)
│   ├── web/              # React/Next.js frontend (TypeScript)
│   │   └── src/
│   │       ├── app/          # Pages
│   │       ├── components/   # Chat UI, approval pop-ups
│   │       └── lib/          # API client
│   └── shared/           # Shared types and protocol definitions
├── infra/                # Docker, Fly.io deploy configs
├── scripts/              # Dev tooling, seed data
└── docs/                 # Architecture decisions
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Agent runtime | Python (FastAPI) + Claude API |
| LLM | Claude (Haiku for routing, Sonnet for reasoning) |
| Frontend | TypeScript, React, Next.js, Tailwind |
| Inter-agent comms | ETO (messaging + payments + file transfer) |
| Database | PostgreSQL + pgvector |
| Cache/queue | Redis |
| Infra | Docker, Fly.io |

## Team

- **Muhammad** — CTO
- **Max** — CEO
- **Likitha** — COO

See `IMPLEMENTATION_PLAN.md` for the week-by-week build plan.
