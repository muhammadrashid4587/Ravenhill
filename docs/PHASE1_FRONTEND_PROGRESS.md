# Phase 1 — V1 Frontend Progress

Source of truth for what's shipped, in-flight, and pending against the locked
V1 surface list (memory: *E-Agent V1 Frontend Plan*, 2026-04-17).

**Last updated:** 2026-04-20
**Branch:** `feature/frontend-v1-next` (off `dev` @ `75629e0`)

---

## Surface-level status

| # | Surface | Status | Route |
|---|---|---|---|
| 1 | Three-panel chat layout | ✅ shipped | `/chat` |
| 2a | Dashboard to-do list | ✅ shipped | `/dashboard` |
| 2b | Dashboard Kanban board | ✅ shipped | `/dashboard` |
| 3 | Two-path onboarding (inference-first) | 🟡 partial | — |
| 4 | Permissions UI in settings | ✅ shipped (mock persist) | `/settings/permissions` |
| 5 | Approval inbox | ✅ shipped | `/approvals` |
| 6 | Notifications surface | 🔲 pending | — |
| 7 | Expertise map (force-directed) | ✅ shipped | `/expertise` |
| 8 | Pending items with staleness flags | ✅ shipped | `/dashboard` |
| 9 | Admin dashboard (org-level) | 🔲 pending | — |
| 10 | Shadow profile (read-only) | ✅ shipped | `/knowledge` |
| 11 | Premium feature stubs | 🔲 pending | — |
| 12 | Calendar + Workspace surfaces | ✅ shipped | `/calendar`, `/drive`, `/inbox` |

**Additions 2026-04-18:**
| Surface | Status | Route |
|---|---|---|
| Slack tab in chat | ✅ shipped | `/chat` |
| File upload in chat | ✅ shipped | `/chat` |
| Meetings Start/Create/Join | ✅ shipped | `/meetings` |

---

## Completion

- **Done: 10 / 15 surfaces → 67%**
- **Remaining: 4 surfaces** (notifications, admin dashboard, premium stubs, onboarding polish)

---

## What shipped this pass (feature/frontend-v1-next)

1. **Expertise map** — `/expertise`
   - Pure-SVG force-directed layout (client-side Verlet simulation — no new
     deps, no `react-force-graph` bundle cost).
   - Filter by kind (all / person / topic) + fuzzy search.
   - Hover a node → isolate its 1-hop neighborhood, right rail shows top
     weighted edges, click-through to agent chat for person nodes.
   - Reads `fetchExpertiseGraph()` mock; swap the one import in `api.ts` when
     Muhammad ships `/api/graph/topology`.
2. **Permissions UI** — `/settings/permissions`
   - Per-scope rule list grouped by team / topic / person / classification /
     external.
   - Standing vs. on-demand + default ready state + allow/deny toggle +
     optional note.
   - Client-side mock persistence via `createPermission` /
     `updatePermission` / `deletePermission` in `lib/mocks.ts`.
   - Warning banner up top: "Schema in flight — coordinating with Muhammad
     before his migration." Do not rely on these rules for real gating until
     the backend lands.
3. **Shadow profile** — already shipped by Muhammad in `5cc40f9` on
   `/knowledge`: top topics, response patterns, preferred channels, close
   collaborators, "private to you" badge, ego-graph. Marked done for V1.
4. **Nav wiring** — added `/expertise` to the sidebar More menu, added a
   `/settings/permissions` link card to the main Settings page.
5. **Design system** — added `.input-dark` primitive to `globals.css` so
   form controls stay consistent with Obsidian/oxblood tokens.

---

## Open decisions / blockers

| Blocker | Owner | Notes |
|---|---|---|
| Permissions schema | Muhammad | Frontend contract in `types.ts` (`Permission`). Confirm before migration. Fields today: `user_id`, `scope_kind`, `scope_value`, `mode`, `allow`, `default_ready_state`, `expires_at?`, `note?`. |
| `/api/graph/topology` endpoint | Muhammad | Shape locked in `types.ts` (`ExpertiseGraph`). Frontend reads the mock; one swap in `lib/api.ts` when live. |
| Notifications endpoint | TBD | Mock already exists (`fetchNotifications`). Surface not yet built. |
| Admin dashboard data model | TBD | `AdminOrgStats` locked in `types.ts`. Must be org-only — no per-user rows per architectural isolation rule. |

---

## Next up (suggested order)

1. **Notifications surface** — low effort, types + mock already in place, just needs a route.
2. **Admin dashboard (org-level)** — reuses `AdminOrgStats` mock, no per-user rows.
3. **Premium feature stubs** — lock icons + upgrade CTAs on the relevant cards.
4. **Onboarding polish** — inference-first flow, reuses Slack RNE + graph already ingested.
