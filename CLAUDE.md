# E-Agent / Ravenhill — Project Guidelines

## What is E-Agent?

E-Agent (codename Ravenhill) is an AI-powered productivity agent for organizations. It eliminates unnecessary status-update meetings by automatically tracking work, notifying the right people, and answering questions like "who has the slides for Project X?" — without anyone needing to ask around.

**Target users:** Employees and members within an organization.

## Architecture Overview

```
e-agent/
├── packages/
│   ├── api/              # FastAPI backend (Python)
│   ├── web/              # React/Next.js frontend (TypeScript)
│   └── shared/           # Shared types and protocol definitions
├── infra/                # Docker, Fly.io deploy configs
├── scripts/              # Dev tooling, seed data
└── docs/                 # Architecture decisions
```

- **Backend:** FastAPI (Python) — handles agent runtime, Claude API integration, messaging, approvals, permissions, and SaaS connectors
- **Frontend:** React / Next.js (TypeScript) — chat UI, approval pop-ups, dashboards
- **AI:** Claude API (via Anthropic SDK) for extraction, summarization, and agent reasoning
- **Deployment:** Fly.io (Docker-based)
- **Integrations:** Slack, Microsoft Teams, Gmail, Google Calendar

## Engineering Principles

### 1. Security First
Meeting and work data is highly sensitive. Every feature must consider data security from the start — not as an afterthought.

- **Authentication:** OAuth 2.0 / OIDC via identity providers (Google Workspace, Microsoft Entra ID). No custom password auth.
- **Authorization:** Role-Based Access Control (RBAC). Users only see data they are permitted to see. Agent actions inherit the permissions of the user who triggered them.
- **Encryption:** TLS in transit (enforce HTTPS everywhere). Encrypt sensitive data at rest (database-level encryption + application-level for PII).
- **Secrets management:** Never commit secrets, API keys, or tokens. Use environment variables and a secrets manager (e.g., Fly.io secrets, Doppler, or AWS SSM).
- **Audit logging:** Log all agent actions, approval decisions, and data access events. Logs must be immutable and tamper-evident.
- **Data minimization:** Do not store raw meeting content or messages longer than necessary. Extract structured insights and purge raw data on a retention schedule.
- **Input validation:** Sanitize all user inputs. Validate all data at system boundaries (API endpoints, webhook receivers, integration callbacks).
- **Dependency security:** Pin dependencies. Run `npm audit` / `pip audit` regularly. No dependencies with known critical CVEs.

### 2. Human-in-the-Loop by Default
The agent must never take high-impact actions (sending messages on behalf of users, sharing data across teams) without explicit approval. The `approvals/` module exists for this reason — use it.

### 3. Keep It Simple
We are a 3-person team targeting MVP this month. Do not over-engineer.

- No premature abstractions. Write the straightforward version first.
- No feature flags or complex configuration systems until we need them.
- Three similar lines of code > a premature abstraction.
- If a module isn't needed for MVP, don't build it. Phase 2 items stay in `docs/` as plans, not in `packages/` as stubs.

### 4. Clear Ownership
Every piece of work tracked by the agent must have a clear owner. The same applies to our code — every module should have a clear responsible person.

## Development Workflow

### Branching Strategy
- `main` — always deployable
- Feature branches: `feature/<short-description>` (e.g., `feature/slack-integration`)
- Bug fixes: `fix/<short-description>`
- All changes go through Pull Requests. At least 1 review required before merge.

### Commit Messages
Use conventional commits:
```
feat: add Slack message forwarding
fix: resolve calendar sync timezone bug
docs: update architecture decision for agent registry
chore: upgrade FastAPI to 0.110
```

### Code Style

**Python (backend):**
- Use `ruff` for linting and formatting
- Type hints on all public functions
- Pydantic models for all API request/response schemas
- Async endpoints in FastAPI where I/O is involved

**TypeScript (frontend):**
- Use `eslint` + `prettier`
- Strict TypeScript (`strict: true` in tsconfig)
- Functional components with hooks (no class components)
- Use `fetch` or a thin API client from `lib/` — no heavy HTTP libraries

### Testing
- Backend: `pytest` with async support. Test API endpoints and agent logic.
- Frontend: Vitest + React Testing Library for component tests.
- Integration tests for each SaaS connector (Slack, Gmail, etc.) using recorded fixtures — do not hit live APIs in CI.

### Running the Project
```bash
# Backend
cd packages/api
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd packages/web
npm install
npm run dev
```

## Integration Guidelines

When adding a new SaaS connector (Slack, Teams, Gmail, Calendar):

1. Create a module under `packages/api/integrations/<service>/`
2. Use OAuth2 for authentication — never store user passwords
3. Use webhooks for real-time events where available; fall back to polling
4. All connector modules must implement a common interface (defined in `shared/`)
5. Write integration tests with recorded API responses
6. Document the required OAuth scopes and setup steps in `docs/`

## AI / Claude API Usage

- All Claude API calls go through `packages/api/agents/`
- Use the Anthropic Python SDK (`anthropic` package)
- Always set `max_tokens` to a reasonable limit — do not leave it unbounded
- Include system prompts that constrain the agent to its role and permissions
- Never pass raw user credentials or secrets into prompts
- Log token usage for cost monitoring
- Handle rate limits gracefully with exponential backoff

## Security Checklist (for every PR)

- [ ] No secrets or API keys in code
- [ ] User input is validated and sanitized
- [ ] New endpoints have proper authentication and authorization
- [ ] Agent actions respect the triggering user's permissions
- [ ] Sensitive data is encrypted at rest
- [ ] No new dependencies with known vulnerabilities
- [ ] Audit log entries added for new actions

## Hard Constraints

- **No storing plaintext credentials** — use OAuth tokens with proper refresh flows
- **No sending messages/emails without user approval** in MVP — always human-in-the-loop
- **No cross-organization data leakage** — strict tenant isolation
- **Claude API key must be server-side only** — never expose to the frontend
- **All environment-specific config via env vars** — no hardcoded URLs, keys, or secrets

## Hosting Recommendation

**Fly.io** (already in `infra/`) is a solid choice for MVP:
- Low-cost, Docker-based deployment
- Built-in secrets management (`fly secrets set`)
- Easy scaling when needed
- Supports PostgreSQL (managed) for the database
- Global edge deployment if needed later

**Database:** Use **PostgreSQL** (Fly Postgres or Supabase) — strong for relational data, RBAC, audit logs, and JSON columns for flexible agent state.

**File storage:** Use **S3-compatible storage** (Tigris on Fly.io, or AWS S3) for any attachments or exports.

## Team

| Name     | Role      | Focus Areas                          |
|----------|-----------|--------------------------------------|
| Likitha  | Technical | Frontend, React/Next.js, UI/UX      |
| Muhammad | Technical | Backend, API, agents, infrastructure |
| Max      | Business  | Product, user research, GTM          |

## Project Management

- **Task tracking:** Notion
- **Documents & files:** Google Drive
- **Code:** GitHub — `muhammadrashid4587/e-agent`
