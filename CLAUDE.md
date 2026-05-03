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

---

## Current Ravenhill Product Changes

**Active spec:** make Ravenhill feel like a real Google-Workspace-connected agent platform, not a mock dashboard. Beta with Rob is **Monday**. Every page that shows data must show *real data, an empty/connect state, or an error state* — never canned mock content.

**Hard rules for this spec:**
- Do NOT reintroduce demo agents (Riley/Jordan/Sam/Alex). They were purged in commit `9ef21d6`.
- Do NOT reintroduce sample-data fallbacks in workspace adapters. Empty-array on no-connection is the rule.
- Do NOT add external tools (analytics, Slack notifications, email delivery), DB schemas, OAuth scope changes, or background jobs without an explicit OK from Muhammad in chat.
- Do NOT capture message content, email content, file names, or any sensitive user behavior in analytics without an explicit OK.
- Mobile-Safari auth fix (`lib/session.ts` localStorage backup) MUST stay — don't delete it.
- Per-statement transactions in `db.py::alter_table_if_needed` MUST stay — single-transaction was a prod-outage cause.

### Status by item

| # | Item | State | Notes |
|---|------|-------|-------|
| 1 | Theme/UI polish | **partly shipped, work pending** | Liki's CSS-var theme is in. **`/settings/page.tsx` is hardcoded `bg-gray-900` / `text-gray-100`** — it doesn't flip in light mode. Settings subpages mixed (HRIS uses theme tokens, others don't). `OrgWeb.tsx` (org page 2D canvas) and `/expertise/page.tsx` use hardcoded hex (no theme). Brand color is currently red-orange (`#FF5A2C` dark, `#E64A19` light) — user wants more red, less orange |
| 2 | Feedback / suggestions | **shipped wave 1** | Floating Feedback button bottom-right of every authed page → modal with category + body. POSTs to `/api/feedback` → persists to `feedback_submissions` table. No external delivery. Files: `components/FeedbackButton.tsx`, `packages/api/feedback/router.py`, `db.py::FeedbackSubmissionRow` |
| 3 | Account section | **shipped wave 1 (business type localStorage-only)** | New `/account` route with profile, workspace (incl. invite-code rotate), business-type picker. Business type is localStorage-only until Muhammad OKs an `org.business_type` column. Sidebar secondary nav now includes "Account" above "Settings" |
| 3b | Business onboarding (type-of-business) | **placeholder mock at `/onboarding`** | Currently uses `fetchOnboardingState`/`setOnboardingState` from `lib/mocks.ts` |
| 4 | HR system | **shipped wave 1.f (real surface, no automation)** | New `/hr` route with 4 connect-data cards (Onboarding → links to `/settings/hris` CSV path; Policy questions → `/drive`; HR docs finder → Drive search; People-ops tasks → `/dashboard` manual tasks). No sensitive automation, no new schema, no new OAuth scopes. `/settings/hris` provider list still mock — known, surfaced as a follow-up |
| 5 | Meetings | **shipped** | Liki's rebuild + Wave 1.f sweep: "Imported Transcripts" verified removed. Empty state now branches on Google-connected vs Google-not-connected with explicit CTA. Reminders shipped (localStorage-only). Zoom tab in `/meetings/new` |
| 6 | Knowledge graph + weekly report | **graph real, weekly report does not exist** | `/knowledge` ego graph uses real `fetchExpertiseGraph`; shadow-profile section still mock. Weekly report has zero scaffolding |
| 7 | Dashboard Tasks block | **partial — meeting-derived only** | Backend `/api/meetings/tasks/mine` exists. Dashboard pulls it. No "Created Tasks" (manual) split. No `/tasks` standalone route |
| 8 | Inbox / Drive / Meetings real-time | **shipped** | All three swept (wave 1.f). `/inbox` empty-state branches: search-active / not-connected / inbox-zero, each with the right CTA. `/drive` removed the type import from `lib/mocks`, inlined `DriveFolder` interface, full-page connect-CTA when not connected. `/meetings` connect-Google primary CTA + import-transcript secondary CTA when not connected. Stale "showing demo data" copy gone everywhere |
| 9 | File upload fallback | **shipped wave 1.c** | New `POST /api/files/summarize` extracts via `pypdf` (PDFs), `python-docx` (DOCX), or UTF-8 decode (text formats), then runs the real LLM. Image OCR explicitly out of scope — returns "needs OCR" state. Chat page wired through this; `smartMockSummary` no longer in the runFileSummary flow (still in file as dead code, scheduled for cleanup). Files: `packages/api/files/router.py`, `packages/web/src/lib/api.ts::summarizeFile` |

### Already shipped (this week, on `dev` and prod)

- Multi-tenant `with_org()` chokepoint, real agent-to-agent messaging, auto-reply gated on capabilities (shadow), seniority-aware routing
- Demo-agent purge from prod DB + sample-data fallbacks removed
- `ravenhillai.com` host allowlist in code (DNS/Vercel domain panel still TODO at registrar)
- Theme-aware verification badges (no more amber-on-cream clash)
- Manifesto → Guidelines rename (label only; route stays `/manifesto`)
- Chat empty-state fix: agent now answers conversationally instead of stonewalling
- **Wave 1 (commit `afc1be8`)**: brand red `#DC2626`/`#B91C1C`, root font 18px, light `--bg-base` `#E0E2E5`, settings + agents/[id] + OrgWeb theme-aware
- **Wave 1.b**: Feedback button + `/api/feedback` + `feedback_submissions` table, `/account` route with profile + workspace + business-type picker (localStorage-only)
- **Wave 1.c**: `/api/files/summarize` via `pypdf` + `python-docx` + UTF-8 decode → real LLM summary; chat upload wired through it (no more canned text for binary files)
- **Waves 1.d + 1.e**: `BehaviorEventRow` + `/api/behavior/{events,weekly-report,privacy}` endpoints; `WeeklyReportModule` on /home (dot graph + summary). `ManualTaskRow` + `/api/tasks/manual` CRUD; `ManualTasksPanel` on /dashboard with inline add + quick-toggle + capture hooks
- **Wave 1.f (parallel agents)**: HR product surface at `/hr`; Inbox/Drive/Meetings mock sweep — empty states branch on Google-connected; `/expertise` canvas edges theme-aware
- **Wave 1.g**: Google OAuth fix (PKCE was auto-generated by `google-auth-oauthlib` but the verifier was lost between auth-url + callback Flow instances → exchange failed with "Missing code verifier"; disabled `autogenerate_code_verifier` since we're a confidential web client with `client_secret`); `/login?invite=<code>` query param now routes signup through `/api/auth/share-link-signup` so teammates land in the inviter's workspace; **`/expertise` route deleted** per Muhammad's request (`/knowledge` page still uses graph data via `fetchExpertiseGraph` adapter — kept)
- **Security hardening (`4c3f3e7`)**: All workspace endpoints + `/api/orchestrate` + `/api/orchestrate/stream` now require session auth via `Depends(get_current_agent)`. No more `agent_id` query param — identity comes from session. Frontend switched to `apiFetch` with credentials. Cross-agent data access blocked. `max_length=10000` on orchestrate message. Tests updated (17/17)
- **People surface (`4c3f3e7`)**: `/api/people` backend (auth-gated, Google Contacts ∩ same-domain agents), `/people` frontend page, `list_google_contacts` adapter (returns [] when not connected), `contacts.readonly` + `contacts.other.readonly` OAuth scopes, People link in sidebar
- **Billing removed (`4c3f3e7`)**: Plan & Billing page deleted, settings card removed
- **UX polish (`3399828`)**: Drive "Ask agent about this" passes file context to chat (auto-sends summarize prompt), assistant display renamed to "Your Raven" everywhere, hardcoded suggestion chips replaced with data-grounded ones (real Calendar/Gmail), "Try the Chat Demo" + "Showing demo data" copy removed
- **Contacts + calendar (`8371d8a`)**: Google Contacts hydrated into chat LLM prompt (up to 15 contacts alongside Calendar/Gmail/Drive); Drive file matching improved (handles underscores, extensions, more keywords); Calendar tabs renamed Agenda/Day/Week/Month, BoardView removed

### Where the related code lives

| Area | Frontend | Backend |
|------|----------|---------|
| Theme tokens | `packages/web/src/app/globals.css` (`:root`, `[data-theme="dark"]`, `[data-theme="light"]`); `packages/web/src/lib/ThemeContext.tsx`; toggle in `components/ui/ThemeToggle.tsx` | n/a |
| Org 3D/2D graph | `packages/web/src/components/organization/OrgWeb.tsx` (no theme awareness) | n/a |
| Expertise graph | `packages/web/src/app/expertise/page.tsx` (hardcoded hex `#FACC15`, `#F87171`) | `packages/api/graph/router.py` `/api/graph/{nodes,edges}` |
| Settings | `packages/web/src/app/settings/*` — main page is `gray-900` hardcoded; HRIS uses theme tokens | n/a |
| Inbox | `packages/web/src/app/inbox/page.tsx` → `lib/api.ts::fetchGmailThreads` | `packages/api/integrations/workspace/adapters.py::list_gmail_threads` |
| Drive | `packages/web/src/app/drive/page.tsx` → `lib/api.ts::fetchDriveFolders/fetchWorkspaceFiles` | `packages/api/integrations/workspace/adapters.py::list_drive_*` |
| Meetings | `packages/web/src/app/meetings/page.tsx` → `lib/api.ts::fetchWorkspaceCalendar` | `packages/api/integrations/workspace/adapters.py::list_calendar_events` + `packages/api/meetings/router.py` |
| Reminders | `packages/web/src/lib/RemindersContext.tsx`, `components/ReminderToasts.tsx` (localStorage only) | n/a |
| Knowledge | `packages/web/src/app/knowledge/page.tsx` (graph real, shadow profile mock from `lib/mocks.ts`) | `packages/api/graph/router.py` |
| Tasks | `packages/web/src/app/dashboard/page.tsx` (meeting-derived list) | `packages/api/meetings/router.py::list_my_tasks` (`/api/meetings/tasks/mine`) |
| Onboarding | `packages/web/src/app/onboarding/page.tsx` (mock state) | none — would need new endpoint to persist |
| HRIS | `packages/web/src/app/settings/hris/page.tsx` (mock providers, real `createAgent`) | `packages/api/agents/router.py` |
| Google integration | OAuth: `packages/api/integrations/workspace/router.py` `/google/{auth-url,callback,disconnect,status}`; tokens at `packages/api/integrations/google_tokens.py` | scopes set in OAuth flow — confirm in router code before adding new ones |
| Slack integration | `packages/api/integrations/slack/{router,oauth,adapter,tokens}.py` (live). Frontend OAuth handoff in `/settings/integrations/slack` | gated on Fly secrets `SLACK_CLIENT_ID/SECRET/SIGNING_SECRET/BOT_TOKEN` |
| File upload | `packages/web/src/app/chat/page.tsx::runFileSummary` (calls `orchestrate` for textual; falls to `smartMockSummary` for binary) | none yet — needs `/api/files/summarize` |
| Activity / events | `packages/api/activity/router.py` exists. Used for orchestrator routing steps. Not currently capturing user behavior | the `activity` table is the place to extend if we add behavior tracking |
| Capabilities (shadow permissions) | `packages/web/src/app/settings/shadow/page.tsx` | `packages/api/capabilities/{registry,service,router}.py` |
| Seniority | `packages/api/agents/seniority.py` | derived from role on signup |

### Decisions locked in (2026-05-01)

| # | Decision |
|---|----------|
| 1 | Brand red: `#DC2626` (dark, Tailwind red-600), `#B91C1C` (light, red-700). Tweakable later — Muhammad said "my hex" meaning his call, defaulted to these |
| 2 | Global root font-size: bump to **18px** (was 17.5px after Liki's bump) |
| 3 | Light-mode `--bg-base`: **`#E0E2E5`** (the proposed midpoint) |
| 4 | Feedback persistence: real DB-backed (new `feedback_submissions` table + `POST /api/feedback`). Free-text body + optional category. No external delivery for now |
| 5 | Account: **separate `/account` route**, distinct from `/settings`. Settings = system/integration config; Account = profile/workspace identity/business type/onboarding |
| 6 | File upload: **Option A** (server-side PDF + DOCX extraction via `pypdf` + `python-docx` → real LLM summary). Image OCR explicitly out of scope tonight — show "needs OCR" state |
| 7 | Behavior event schema (privacy bar): `{event_type, timestamp, object_type, object_id, status, agent_id, org_id}` — NO message bodies, NO email content, NO file names. New `behavior_events` table (separate from `activity` which is orchestrator-only). Weekly Report renders on `/home` as a banner above the existing destination cards |
| 8 | Manual Tasks: yes — new `manual_tasks` table (or extend existing `tasks` with `source: meeting | manual`) with `title, description, due_date, priority, status, source, created_at, updated_at`. Tasks block on dashboard splits "Your Tasks" (meeting/calendar) and "Created Tasks" (manual) |
| 9 | HR system: **both** — keep `/settings/hris` placeholder AND add a real `/hr` product surface with connect-HRIS + manual roster + policies placeholder. No sensitive automation |
| 10 | Slack creds: Muhammad to create the app — see "What I need from you for Slack" below |

### What I need from you for Slack (item 10)

Go to https://api.slack.com/apps → Create New App → From scratch → name it "Ravenhill" (or whatever) → pick your workspace.

On the app's pages, copy these four values into chat for me to set as Fly secrets:
1. **`SLACK_CLIENT_ID`** — Basic Information → App Credentials → "Client ID"
2. **`SLACK_CLIENT_SECRET`** — Basic Information → App Credentials → "Client Secret" (click Show)
3. **`SLACK_SIGNING_SECRET`** — Basic Information → App Credentials → "Signing Secret" (click Show)
4. **`SLACK_BOT_TOKEN`** — Install App → "Bot User OAuth Token" (starts with `xoxb-`). Will only appear after you configure scopes + install to your workspace.

Also configure on the app:
- **OAuth & Permissions → Redirect URLs**: add `https://ravenhill-api.fly.dev/api/integrations/slack/callback`
- **OAuth & Permissions → Bot Token Scopes**: add `channels:read`, `channels:history`, `chat:write`, `users:read`, `groups:read`, `im:read`
- **Event Subscriptions** (optional, for incoming events): Request URL `https://ravenhill-api.fly.dev/api/integrations/slack/events`, subscribe to `message.channels`, `message.im`

Drop those four secrets in chat when ready. I'll set them on Fly and verify the integration immediately.

### Open questions still on Muhammad's plate (low urgency)

- Slack credentials — see "What I need from you for Slack" above
- Rob's email + company-folder ID/name — for Drive scoping when he OAuths Google
- "momo-dev" / model name — disregarded for now per Muhammad's message

### Update protocol for this section

Whenever a meaningful change lands during the Rob-Monday push:
1. Update the **Status by item** table.
2. Add a one-line entry under **Already shipped** with the commit short-hash.
3. Cross out / move out of **Open questions** anything Muhammad has answered.
4. Add new questions as they surface.
