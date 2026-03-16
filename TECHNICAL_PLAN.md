# e-agent Technical Plan

**Last updated**: March 2026
**Author**: Muhammad (CTO)
**Status**: Pre-seed, Phase 0 (Demo Build)

---

## What We're Building

Every employee at a company gets a personal AI agent. The agents talk to each other. Work that currently requires human chains (questions, file requests, status updates) happens instantly, within existing permissions.

---

## Architecture

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                     Admin Control Plane                         │
  │                   (IT / Executive Dashboard)                    │
  │                                                                 │
  │  • Agent lifecycle    • Spend controls     • Org-wide policies  │
  │  • Assign/revoke      • Usage analytics    • Compliance rules   │
  │  • Monitor activity   • Budget alerts      • Kill switch        │
  └──────────┬──────────────────┬──────────────────┬────────────────┘
             │ manage           │ observe          │ enforce
             ▼                  ▼                  ▼
  ┌──────────────────────────────────────────────────────────────┐
  │                        Client Layer                          │
  │                  Web / Slack / Mobile / Voice                 │
  └────────────────────────────┬─────────────────────────────────┘
                               │
                        ┌──────▼───────┐
                        │  API Gateway  │
                        └──────┬───────┘
                               │
             ┌─────────────────┼─────────────────┐
             ▼                 ▼                  ▼
    ┌────────────────┐ ┌─────────────┐  ┌────────────────┐
    │ Agent Runtime   │ │  Platform   │  │  ETO Layer     │
    │ (per employee)  │ │  Services   │  │  (partner)     │
    │                 │ │             │  │                │
    │ • LLM reasoning │ │ • Registry  │  │ • Messaging    │
    │ • Tool execution│ │ • Router    │  │ • Payments     │
    │ • Knowledge base│ │ • Approvals │  │ • File transfer│
    │ • Permissions   │ │ • Audit log │  │   (up to 80GB) │
    └────────────────┘ │ • Permissions│  │ • Cross-chain  │
                       └─────────────┘  └────────────────┘
```

### Admin Control Plane

The Admin Control Plane sits above the entire system, giving IT admins and executives full visibility and control over every agent in the organization.

**Agent Lifecycle Management**
- Provision/deprovision agents per employee or team
- Assign additional agents to employees (e.g., a manager gets a "team summary" agent alongside their personal agent)
- Bulk onboard/offboard synced with HR systems
- Pause or kill any agent instantly

**Monitoring & Observability**
- Real-time dashboard: active agents, queries/min, inter-agent traffic
- Per-agent activity feed: what each agent did, who it talked to, what it accessed
- Anomaly detection: flag unusual patterns (e.g., agent accessing data outside normal scope)
- Health checks and uptime tracking

**Spend Controls**
- Per-agent and per-department LLM token budgets
- Real-time spend tracking with configurable alerts (50%, 80%, 100% thresholds)
- Cost attribution: break down spend by agent, department, use case
- Rate limiting: cap requests per agent per hour/day
- ETO transaction cost tracking for inter-agent payments

**Org-Wide Policies**
- Global permission overrides (e.g., "no agent can access HR data without VP approval")
- Compliance rules: data residency, retention policies, PII handling
- Approval flow configuration: set which actions require human sign-off at the org level
- Agent capability restrictions: disable specific tools or integrations per role/department

**Dashboard Views**
- **Executive view**: spend summary, adoption metrics, ROI indicators, top use cases
- **IT admin view**: agent health, permission audit, security events, system performance
- **Department manager view**: team agent activity, spend by report, approval queue

### ETO as the Inter-Agent Backbone

ETO (eto.markets) handles the full inter-agent communication layer — messaging, payments, and file transfers. It's not just settlement; it's the transport.

- **Messages**: All agent-to-agent communication routes through ETO
- **Files**: Transfers up to 80GB, blockchain-verified delivery
- **Payments**: Cross-chain settlement for agent transactions
- **Throughput**: 1M+ transactions
- **Cross-chain**: Chain-agnostic, connects every blockchain

This means we don't need to build our own messaging infrastructure. ETO is the nervous system between agents. We build the agent runtime, the intelligence layer, and the user-facing product on top.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Agent runtime | Python (FastAPI) + Claude API |
| LLM | Claude — Haiku for routing, Sonnet for reasoning |
| Frontend | TypeScript, React, Next.js |
| Inter-agent comms | ETO (messaging + payments + file transfer) |
| Database | PostgreSQL + pgvector |
| Cache/queue | Redis |
| Auth | OIDC/SAML (plugs into customer's IdP) |
| Secrets | AWS Secrets Manager |
| Infra | Docker, Fly.io (now), AWS ECS (later) |
| Observability | OpenTelemetry + Grafana |

---

## Phase 0: The Demo (2-Week Sprint — Mar 16-27)

**Goal**: Two agents talking to each other live. Sells the vision in 60 seconds.
**Ship date**: March 27, 2026. Demo meetings start March 30.

### What we're building

- [ ] Two agent instances with pre-loaded personas ("Sales Rep" + "Finance Analyst")
- [ ] Web UI showing both agents side by side
- [ ] **Demo 1 — Knowledge routing**: Agent A asks "Who owns Q4 revenue forecast?" → routed via ETO to Agent B → instant answer
- [ ] **Demo 2 — Document sharing**: Agent A requests a file → Agent B's human gets approval pop-up → one-click approve → file shared via ETO
- [ ] Inter-agent communication is real (through ETO), not mocked
- [ ] SaaS integrations can be simulated

### Week-by-week

**Week 1 (Mar 16-20)**: Backend end-to-end (agents + Claude + ETO + routing), frontend core (split-screen demo UI, both demos wired up), deploy to Fly.io on Day 1
**Week 2 (Mar 23-27)**: ETO production integration, visual polish, hardening, production lockdown, demo day

See `IMPLEMENTATION_PLAN.md` for the full day-by-day breakdown.

### What we're NOT building yet

- Real SaaS integrations (Google, Slack, etc.)
- Multi-tenant architecture
- Production auth / IdP sync
- Admin dashboard
- Voice interface

---

## Phase 1: Working Single Agent (Weeks 6-14)

- Google Workspace integration (Calendar, Drive, Gmail)
- Slack integration
- NL chat + voice interface
- Knowledge base auto-populated from connected systems
- Trust thresholds and approval flows

## Phase 2: Multi-Agent for Design Partners (Weeks 15-24)

- Agent registry from real org chart / IdP
- Full inter-agent protocol with targeted routing
- Permission engine synced with IdP
- **Admin Control Plane**
  - Admin dashboard (executive, IT admin, department manager views)
  - Agent lifecycle management: provision, assign, pause, kill
  - Spend controls: per-agent budgets, alerts, cost attribution
  - Monitoring: real-time activity feeds, anomaly detection
  - Org-wide policy engine: compliance rules, capability restrictions
- Audit logging
- Multi-tenant

---

## Inter-Agent Message Format

```json
{
  "message_id": "uuid",
  "type": "QUERY | DOC_REQUEST | ACTION | BROADCAST",
  "from_agent": "agent_id",
  "to_agent": "agent_id | null (routed by registry)",
  "intent": "natural language + structured fields",
  "permission_ctx": {
    "role": "sales_rep",
    "department": "sales",
    "scopes": ["read:public", "read:sales"]
  },
  "requires_approval": false,
  "ttl_seconds": 30,
  "payload": {},
  "trace_id": "uuid"
}
```

All messages are transported via ETO's infrastructure, giving us blockchain-verified delivery and an immutable audit trail for free.

---

## Key Decisions (Made)

1. **ETO is the inter-agent backbone** — messaging, file transfers, and payments all route through ETO. We don't build our own messaging infra.
2. **Permissions inherit from the company's IdP** — we don't build a new access model. We sync with Okta/Azure AD/Google.
3. **Targeted routing, not broadcast** — the registry narrows queries to 1-5 relevant agents. We don't fan out to every agent in the org.
4. **Human-in-the-loop defaults to conservative** — everything that touches another person's data requires approval until the user loosens the threshold.
5. **Claude API as the LLM backbone** — Haiku for fast classification/routing, Sonnet for complex reasoning tasks.
6. **Bottoms-up deployment** — a team of 10 can start using this without IT buy-in. Enterprise sale comes after proven value.

---

## Repo Structure

```
e-agent/
├── packages/
│   ├── api/              # FastAPI backend
│   │   ├── agents/       # Agent runtime, LLM integration
│   │   ├── messaging/    # ETO integration layer
│   │   ├── registry/     # Agent discovery service
│   │   ├── approvals/    # Human-in-the-loop service
│   │   ├── permissions/  # RBAC + IdP sync
│   │   ├── admin/        # Admin Control Plane backend
│   │   │   ├── lifecycle/    # Agent provisioning, assignment, kill switch
│   │   │   ├── monitoring/   # Activity feeds, anomaly detection, health
│   │   │   ├── spend/        # Budgets, alerts, cost attribution, rate limits
│   │   │   └── policies/     # Org-wide rules, compliance, capability restrictions
│   │   └── integrations/ # SaaS connectors (Google, Slack, etc.)
│   ├── web/              # React/Next.js frontend
│   │   ├── components/   # Chat UI, approval pop-ups, agent views
│   │   └── pages/
│   │       ├── chat/         # Employee chat interface
│   │       └── admin/        # Admin dashboard
│   │           ├── overview/     # Executive summary, adoption, ROI
│   │           ├── agents/       # Agent list, lifecycle, assign/revoke
│   │           ├── spend/        # Budget tracking, alerts, cost breakdown
│   │           ├── activity/     # Per-agent activity feed, audit log
│   │           └── policies/     # Org-wide policy configuration
│   └── shared/           # Types, utils, protocol definitions
├── infra/                # Docker, deploy configs
├── docs/                 # API docs, architecture decisions
└── scripts/              # Dev tooling, seed data
```

---

## Security (Non-Negotiable from Day 1)

- Zero-trust between agents: every message carries permission context
- OAuth tokens encrypted at rest, isolated per user
- Full audit log of every agent action and inter-agent exchange (via ETO's blockchain trail)
- PII classification before sending data to LLM
- Claude API zero-retention mode for sensitive contexts

---

## Team (Current)

- **Muhammad** — CTO. Architecture, agent runtime, inter-agent protocol.
- **Max** — CEO. Business, operations, GTM, fundraising.
- **ETO** — Partner. Inter-agent messaging, payments, file transfer infrastructure.
- **Hiring**: Senior full-stack engineer (immediate need).
