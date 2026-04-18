# Q2 Launch PRD — SideLineSwap Rollout

**Owner:** Max Ravenhill
**Status:** Draft → under review
**Target ship:** 2026-06-01
**Last updated:** 2026-04-16

---

## Summary

E-Agent is rolling out inside SideLineSwap as the first design-partner deployment. V1 includes the three-panel chat surface, inference-first onboarding, permissions UI, and the approval inbox. This PRD captures scope, owners, and open risks for the SLS launch.

## Goals

1. Deploy V1 inside SLS by 2026-06-01 with at least 20 active users in week one.
2. Prove inference-first onboarding cuts time-to-first-value to under 10 minutes.
3. Collect 3 concrete workflow wins (decisions surfaced, stale items flagged, cross-team routing) to anchor the case study.

## Non-goals

- HRIS integration (deferred until a partner asks).
- Real-time voice mode (nice-to-have, Phase 2).
- Admin-per-user analytics (architectural isolation — org-level only).

## Scope & Owners

| Area | Owner | Status |
|---|---|---|
| Three-panel chat UI | Likitha Kamble | In progress |
| Dashboard + Kanban board view | Likitha Kamble | Not started |
| Permissions UI + schema | Likitha Kamble, Muhammad Rashid | Schema in review |
| Backend API + Postgres migration | Muhammad Rashid | Foundation shipped 2026-04-16 |
| Slack adapter | Muhammad Rashid | Blocked on OAuth |
| Google Workspace adapter | Muhammad Rashid | Gmail draft ready |
| Design-partner onboarding | Max Ravenhill | Kickoff done |
| Case-study interviews | Max Ravenhill | Scheduled week of 2026-05-11 |

## Action Items

- [ ] **Muhammad:** finalize Slack OAuth token encryption by 2026-04-22.
- [ ] **Likitha:** land Slack tab + file upload in chat surface by 2026-04-25.
- [ ] **Max:** confirm SLS admin has provisioned 30 seats by 2026-04-30.
- [ ] **Muhammad:** Alembic migration for permissions schema before 2026-05-02.
- [ ] **Likitha:** Kanban board view reading from `pending_items` endpoint by 2026-05-05.
- [ ] **Max:** book 8 case-study interviews for week of 2026-05-11.
- [ ] **Team:** dry-run deployment rehearsal 2026-05-25.

## Open Risks

1. **Slack rate limits.** We haven't load-tested the adapter against SLS's message volume; Muhammad flagged this as the biggest unknown.
2. **Permissions schema churn.** The UI is going out mocks-first — if the backend schema lands differently, we eat rework. Mitigation: review schema before migration.
3. **Onboarding inference accuracy.** If the comms-graph inference misses obvious owners, trust in the product drops fast. Mitigation: manual override in calibrate step.

## Approvals

- Product: Max (owner, approved 2026-04-16)
- Engineering: Muhammad (approved with conditions — see Slack risk above)
- Design: pending

---

*This is a sample file bundled with E-Agent for testing the chat file-exchange flow. Drop it into the chat to see the receiving agent summarize contributors, action items, and open decisions.*
