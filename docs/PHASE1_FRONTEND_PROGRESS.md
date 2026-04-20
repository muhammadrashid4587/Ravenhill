# Phase 1 — V1 Frontend Progress

Source of truth for what's shipped against the locked V1 surface list (memory:
*E-Agent V1 Frontend Plan*, 2026-04-17).

**Last updated:** 2026-04-20
**Branch:** `feature/frontend-v1` (off `dev` @ `75629e0`)
**Status:** ✅ **Phase 1 frontend complete (15 / 15 surfaces)**

---

## Surface-level status

| # | Surface | Status | Route |
|---|---|---|---|
| 1 | Three-panel chat layout | ✅ shipped | `/chat` |
| 2a | Dashboard to-do list | ✅ shipped | `/dashboard` |
| 2b | Dashboard Kanban board | ✅ shipped | `/dashboard` |
| 3 | Two-path onboarding (inference-first) | ✅ shipped | `/onboarding` |
| 4 | Permissions UI in settings | ✅ shipped (mock persist) | `/settings/permissions` |
| 5 | Approval inbox | ✅ shipped | `/approvals` |
| 6 | Notifications surface | ✅ shipped | `/notifications` |
| 7 | Expertise map (force-directed) | ✅ shipped | `/expertise` |
| 8 | Pending items with staleness flags | ✅ shipped | `/dashboard` |
| 9 | Admin dashboard (org-level) | ✅ shipped | `/admin` |
| 10 | Shadow profile (read-only) | ✅ shipped | `/knowledge` |
| 11 | Premium feature stubs | ✅ shipped | `/settings/billing` + `<PremiumLock>` |
| 12 | Calendar + Workspace surfaces | ✅ shipped | `/calendar`, `/drive`, `/inbox` |

**Additions 2026-04-18:**
| Surface | Status | Route |
|---|---|---|
| Slack tab in chat | ✅ shipped | `/chat` |
| File upload in chat | ✅ shipped | `/chat` |
| Meetings Start/Create/Join | ✅ shipped | `/meetings` |

**Completion: 15 / 15 → 100%**

---

## Shipped this pass (feature/frontend-v1)

### Earlier today (commit `ae7d986`)
1. **Expertise map** — `/expertise`, pure-SVG force-directed layout, no new dep.
2. **Permissions UI** — `/settings/permissions`, client-side mock CRUD with
   in-page schema-in-flight warning.
3. `.input-dark` primitive in `globals.css`.

### Tonight (this commit)
4. **Notifications** — `/notifications`
   - Feed grouped by read/unread, filter toggle, mark-one + mark-all-read.
   - Verification status as visual badges (verified / inferred / unverified).
   - Action-first headline + change summary subline, relative timestamps,
     deep link on click.
   - Mock setters: `markNotificationRead`, `markAllNotificationsRead`.
5. **Admin dashboard** — `/admin`
   - Org-level tiles only: users, active-24h, active agents, ingestion
     counts, graph size, approval throughput.
   - Explicit banner: admins cannot see any individual user's shadow
     profile, messages, or approval content.
   - Premium add-ons lane (SSO, analytics export, custom retention, priority
     ingestion) uses the new `<PremiumLock>` primitive.
6. **Premium stubs** — `<PremiumLock>` primitive (`chip`/`card`/`banner`
   variants) + a full `/settings/billing` page with four tiers (Free, Team,
   Business, Enterprise), "Stripe coming soon" banner, notify-the-team
   confirmation modal.
7. **Onboarding** — `/onboarding`, inference-first, five steps (welcome →
   connect_comms → inference_preview → calibrate → permissions_default →
   done), step-progress bar, source picker, inferred team/role/topics/
   collaborators preview, calibration form, not-ready-by-default permissions
   explainer. Mock setter `setOnboardingState` keeps progress across reloads
   in-session.
8. **Navigation** — Sidebar `More` menu gains `/notifications`, `/admin` in
   addition to the `/expertise` link added earlier. Main settings page gains
   a Plan & billing link card next to Permissions.

---

## Files added / changed this session

| File | Purpose |
|---|---|
| `packages/web/src/app/expertise/page.tsx` | Org-wide expertise map |
| `packages/web/src/app/settings/permissions/page.tsx` | Permissions CRUD |
| `packages/web/src/app/notifications/page.tsx` | Notifications feed |
| `packages/web/src/app/admin/page.tsx` | Admin dashboard |
| `packages/web/src/app/settings/billing/page.tsx` | Plan picker + upgrade |
| `packages/web/src/app/onboarding/page.tsx` | Inference-first setup |
| `packages/web/src/components/ui/PremiumLock.tsx` | Upgrade affordance primitive |
| `packages/web/src/components/Sidebar.tsx` | Nav entries for new surfaces |
| `packages/web/src/app/settings/page.tsx` | Permissions + Billing link cards |
| `packages/web/src/app/globals.css` | `.input-dark` primitive |
| `packages/web/src/lib/mocks.ts` | Mutation setters for permissions, notifications, onboarding |
| `docs/PHASE1_FRONTEND_PROGRESS.md` | This doc |

---

## Blockers on the backend side (for Muhammad)

| Blocker | Notes |
|---|---|
| Permissions schema | Contract locked in `types.ts` (`Permission`). Review before migration. Fields: `user_id`, `scope_kind`, `scope_value`, `mode`, `allow`, `default_ready_state`, `expires_at?`, `note?`. |
| `/api/graph/topology` endpoint | Shape locked in `types.ts` (`ExpertiseGraph`). One swap in `lib/api.ts` when live. |
| `/api/notifications` | Shape + mutation endpoints already mocked. `NotificationItem` locked in `types.ts`. |
| `/api/admin/org-stats` | `AdminOrgStats` locked in `types.ts`. **Must be org-only** — no per-user rows per architectural isolation rule. |
| Onboarding state persistence | `OnboardingState` locked. Needs a per-user row keyed by `user_id`. |
| Stripe integration | Phase 2. Today the billing page notifies the team on plan selection. |

---

## Dev server

```bash
cd packages/web
npm install          # first time only
npm run dev          # http://localhost:3000
```

For the backend (optional — the frontend runs off mocks):
```bash
cd packages/api
uvicorn main:app --reload --port 8000
```
