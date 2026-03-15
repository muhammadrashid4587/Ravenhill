# e-agent Implementation Plan

**Team**: Muhammad (CTO), Max (CEO), Likitha (COO)
**Date**: March 15, 2026
**Target**: Phase 0 Demo — two agents talking live, sells the vision in 60 seconds

---

## Team Roles for Phase 0

### Muhammad (CTO) — Builder
Owns all engineering. Writes all production code. Makes all technical decisions.

### Likitha (COO) — Product & QA & Ops
Owns the demo experience end-to-end. Defines what the demo *feels* like, tests everything, writes demo scripts, manages the ETO partner relationship day-to-day, and handles operational setup (accounts, environments, tooling access). Can pick up lighter frontend/config work over time.

### Max (CEO) — Business & Fundraising
Owns the narrative. Uses the demo to pitch investors and design partners. Feeds back what resonates and what doesn't. Runs design partner outreach in parallel with the build.

---

## Week 1: Foundation (Mar 17 – Mar 21)

### Muhammad
- [ ] Initialize monorepo (`packages/api`, `packages/web`, `packages/shared`)
- [ ] Set up FastAPI backend with project structure
- [ ] Wire up Claude API (Haiku for routing, Sonnet for reasoning)
- [ ] Build two hardcoded agent instances ("Sales Rep" + "Finance Analyst")
- [ ] Basic agent runtime: receives a message, calls Claude, returns a response
- [ ] PostgreSQL + pgvector setup (Docker Compose for local dev)
- [ ] Seed data: pre-loaded personas with role metadata and knowledge snippets

### Likitha
- [ ] Set up project management board (Linear, Notion, or whatever the team uses)
- [ ] Write detailed persona definitions for both demo agents:
  - Sales Rep: name, role, what they know, what files they own
  - Finance Analyst: name, role, what they know, what files they own
- [ ] Draft v1 of the demo script — the exact conversation flow for both demos
- [ ] Set up shared dev environment access (GitHub, Fly.io account, API keys)
- [ ] Coordinate with ETO: get API docs, sandbox access, point of contact for integration questions

### Max
- [ ] Refine the 60-second pitch narrative around the demo
- [ ] Start building a target list of 10-15 design partner companies (via Foundry network)
- [ ] Begin warm outreach to 3-5 potential design partners ("we're building something, want to see it in 4 weeks?")

### Sync
- **End of week**: 30-min all-hands. Muhammad demos what's running locally. Likitha walks through demo script. Max shares outreach pipeline.

---

## Week 2: Inter-Agent Communication (Mar 24 – Mar 28)

### Muhammad
- [ ] Integrate ETO SDK/API for agent-to-agent messaging
- [ ] Implement the inter-agent message format (QUERY, DOC_REQUEST types)
- [ ] Build agent registry service: stores agent metadata (role, department, knowledge areas)
- [ ] Implement targeted routing: Agent A's query gets routed to the right agent based on registry lookup
- [ ] End-to-end flow working in terminal: Agent A asks question → ETO routes → Agent B answers
- [ ] Basic permission context attached to every message

### Likitha
- [ ] Test the ETO integration as it comes online — flag issues immediately
- [ ] Refine demo script based on what's actually working vs. what's not
- [ ] Document the exact API contract between our agents and ETO (for the team's reference)
- [ ] Research and wireframe the approval pop-up UX (screenshot references, sketch in Figma or on paper)
- [ ] Start drafting FAQ / objection handling doc for Max's investor conversations

### Max
- [ ] Schedule 3-5 demo meetings for end of Week 5
- [ ] First pass at pitch deck (even if slides are rough — the demo is the pitch)
- [ ] Get feedback on positioning from 2-3 trusted Foundry contacts

### Sync
- **End of week**: Muhammad demos two agents talking via ETO in the terminal. Team validates the message flow matches the demo script.

---

## Week 3: Frontend (Mar 31 – Apr 4)

### Muhammad
- [ ] Scaffold Next.js app (`packages/web`)
- [ ] Build chat interface component (message input, message history, typing indicators)
- [ ] Build dual-agent split-screen view (see both agents side by side)
- [ ] Connect frontend to FastAPI backend via WebSocket or SSE (real-time message streaming)
- [ ] Build approval pop-up component (request summary + approve/deny buttons)
- [ ] Demo 1 working end-to-end in browser: knowledge routing query → answer appears

### Likitha
- [ ] QA the web UI aggressively — every edge case, every broken state, every confusing label
- [ ] Write exact demo script v2 with specific questions/responses that showcase the product best
- [ ] Test on different screen sizes (this will be demoed on projectors, Zoom screenshare, laptops)
- [ ] Create demo seed data: realistic company names, employee names, document titles
- [ ] Help style the UI if comfortable (CSS tweaks, copy changes — Muhammad can pair on this)

### Max
- [ ] Review the UI and give feedback from a "what would impress an investor" lens
- [ ] Finalize pitch deck structure — demo will be embedded/screenshotted into slides
- [ ] Confirm 3+ demo meetings for Week 5

### Sync
- **Mid-week**: Quick 15-min check-in. Is the UI telling the right story?
- **End of week**: Full team walkthrough of Demo 1 in the browser.

---

## Week 4: File Transfer + Full Scenarios (Apr 7 – Apr 11)

### Muhammad
- [ ] Integrate ETO file transfer for Demo 2 (document sharing flow)
- [ ] Build the full Demo 2 flow: file request → approval pop-up → file delivered
- [ ] Wire up both demos as selectable scenarios in the UI
- [ ] Add visual polish: loading states, success animations, agent avatars/icons
- [ ] Error handling: graceful fallbacks if ETO is slow or Claude returns unexpected output
- [ ] Basic observability: structured logging so we can debug demo failures fast

### Likitha
- [ ] End-to-end QA of both demo scenarios — run them 20+ times each
- [ ] Build a "demo run checklist" — everything that needs to be true before a live demo
- [ ] Time the demos — each scenario should land in under 30 seconds
- [ ] Create backup plan: what do we show if ETO is down? (pre-recorded fallback?)
- [ ] Prepare the "how it works" explanation for non-technical audiences (2-3 slides Max can use)

### Max
- [ ] Do a practice pitch using the working demo — time it, record it, review it
- [ ] Share a short video clip or GIF of the demo with warm leads to build hype
- [ ] Lock in final demo meeting schedule

### Sync
- **End of week**: Full dress rehearsal. Run both demos back-to-back as if it's a real pitch. Time it. Note every stumble.

---

## Week 5: Polish + Deploy + Demo (Apr 14 – Apr 18)

### Muhammad
- [ ] Deploy to Fly.io (Docker containerized, environment variables locked down)
- [ ] Fix every bug from Likitha's QA list
- [ ] Performance tuning: response times should feel instant (< 2s for routing, < 5s for full answer)
- [ ] Add a "reset demo" button that clears state for back-to-back demos
- [ ] Harden: make sure the demo doesn't break if someone types something unexpected
- [ ] SSL, domain setup (demo.e-agent.ai or similar)

### Likitha
- [ ] Final QA on production deployment — run full test suite on Fly.io, not just local
- [ ] Prepare demo environment: seed data loaded, agents initialized, everything warm
- [ ] Write the "demo day" runbook: step-by-step for whoever is driving the demo
- [ ] Be on standby during live demos to monitor for issues
- [ ] Start scoping Phase 1 ops: what design partner onboarding looks like

### Max
- [ ] Deliver demos to design partner candidates
- [ ] Collect feedback: what excited them, what confused them, what would make them pay
- [ ] Start fundraising conversations using demo as proof of concept
- [ ] Debrief with team: what did the market tell us? Does it change our Phase 1 priorities?

### Sync
- **Monday**: Final go/no-go on production readiness
- **Wednesday+**: Live demos begin
- **Friday**: Full team retro — what worked, what didn't, what's Phase 1

---

## Weekly Rituals

| Ritual | When | Who | Format |
|--------|------|-----|--------|
| All-hands sync | Friday 4pm | Everyone | 30 min, demo + blockers + next week |
| Muhammad ↔ Likitha | Daily standup | Muhammad, Likitha | 10 min async (Slack) or quick call |
| Max check-in | Tuesday + Thursday | Max + whoever | 15 min, pipeline updates + feedback |
| Demo dry run | Week 4 Friday | Everyone | 45 min, full dress rehearsal |

---

## How Max Stays in the Loop

Max wants visibility into the technical side — not just the product, but the engineering. Here's how:
1. **Friday all-hands**: See the product evolve every week
2. **Coding "listen-in" sessions**: Muhammad streams or shares screen 1-2x/week while building. Max can watch, ask questions, absorb context. No obligation to contribute — just soak it in. This builds Max's technical intuition for investor conversations ("let me tell you how this actually works under the hood").
3. **Demo recordings**: Muhammad or Likitha screen-record key milestones and drop them in Slack
4. **Architecture walkthrough**: Muhammad does a 20-min whiteboard session in Week 1 explaining the system diagram. Max doesn't need to remember it all — just enough to speak credibly.
5. **Weekly bullet summary**: Likitha sends a 5-bullet "here's where we are" every Friday after sync
6. **Pitch feedback loop**: Max brings back market signal, team adjusts priorities

---

## Definition of Done (Phase 0)

The demo is ready when ALL of these are true:
- [ ] Two agents with distinct personas visible in a split-screen web UI
- [ ] Demo 1: Type a question → agent routes it → answer appears in < 5 seconds
- [ ] Demo 2: Request a file → approval pop-up appears → one-click approve → file delivered
- [ ] All inter-agent communication goes through ETO (not mocked)
- [ ] Deployed to a public URL that works on any laptop/projector
- [ ] Demo can be reset and re-run in < 10 seconds
- [ ] Non-technical person (Max) can drive the demo without Muhammad present

---

## What Comes After Phase 0

Decisions to make based on demo feedback:
- Which demo scenario resonated most? That's the Phase 1 entry wedge.
- Did design partners care more about the personal assistant or the multi-agent layer?
- What integrations did they ask about first? (Google, Slack, etc.)
- Is the deployment motion bottoms-up (team of 10) or top-down (IT buy-in)?

Phase 1 planning starts Week 5 Friday retro.
