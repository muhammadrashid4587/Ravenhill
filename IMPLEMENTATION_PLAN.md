# e-agent Implementation Plan — 2-Week Sprint

**Team**: Muhammad (CTO), Max (CEO), Likitha (COO)
**Start**: Monday, March 16, 2026
**Ship date**: Friday, March 27, 2026
**Target**: Live demo on a public URL — two agents talking, sells the vision in 60 seconds

---

## Philosophy

10 days. One engineer. No fluff.

- Deploy to Fly.io on Day 1 — the live URL exists from the start, not the end.
- Build the backend and frontend in parallel within the same days, not sequential weeks.
- ETO is the plan. Redis pub/sub is the fallback. If ETO's sandbox isn't ready by Day 3, switch to the fallback and swap ETO in later — never be blocked on an external dependency.
- Both demos ship. Knowledge routing (Demo 1) is the priority. File sharing (Demo 2) is the closer. If time runs out, Demo 1 alone is enough to raise money.
- Every day ends with something demoable. If Muhammad gets hit by a bus on Day 6, whatever's deployed still tells the story.

---

## Team Roles

### Muhammad (CTO) — Builder
All engineering. Every line of production code. Sole focus: make the demo work.

### Likitha (COO) — Product, QA, Ops
Owns the demo *experience*. Writes the script, defines what the agents say, tests every flow, manages ETO coordination, handles all non-coding setup. She is the quality gate — nothing goes live without her running it 10 times.

### Max (CEO) — Narrative, Fundraising, Distribution
Builds the pitch around the demo. Lines up meetings for Week 3. Listens in on coding sessions to build technical fluency. His job during these 2 weeks: make sure that the moment the demo is ready, there are people waiting to see it.

---

## Day-by-Day: Muhammad (Engineering)

### Day 1 — Monday, Mar 16: Boot Everything

- [ ] Get the API server running locally (`uvicorn main:app --reload`)
- [ ] Verify Claude API calls work: send a message to sales agent, get a response
- [ ] Verify both demo agents (Jordan Chen + Karen Park) respond in-character
- [ ] Deploy the skeleton to Fly.io — even if it's just the `/health` endpoint. Live URL exists from today.
- [ ] Set up CI: push to main → auto-deploy to Fly.io (GitHub Actions, ~20 min to configure)

**End of day**: You can `curl` the Fly.io URL and get a health check. You can chat with both agents locally via `/docs`.

### Day 2 — Tuesday, Mar 17: Inter-Agent Messaging

- [ ] Build the orchestrator: the brain that takes a user question, classifies intent (Haiku), queries the registry, routes to the right agent, and returns the answer
- [ ] Wire up the full Demo 1 flow in the backend:
  - User asks Jordan (Sales): "Who owns Q4 revenue forecast?"
  - Jordan's agent classifies → QUERY about finance
  - Registry lookup → finds Karen (Finance)
  - Message sent to Karen's agent → Karen's agent answers
  - Answer returned to the user through Jordan
- [ ] Test with 5+ different queries to make sure routing is reliable
- [ ] Start ETO integration — if sandbox is live, wire real messaging. If not, use in-memory message passing (swap later).

**End of day**: Demo 1 works end-to-end via API calls. You can show it in a terminal.

### Day 3 — Wednesday, Mar 18: Frontend Core

- [ ] Build the demo page (`/demo`): split-screen layout with two agent panels
- [ ] Left panel: "You + Jordan (Sales)" — chat interface where the user talks to their agent
- [ ] Right panel: "Karen (Finance)" — shows Karen's agent activity (receives query, sends response)
- [ ] Connect frontend to backend via API calls (polling is fine for now, WebSocket is a nice-to-have)
- [ ] Real-time feel: show typing indicators and message-by-message rendering

**End of day**: Demo 1 works in a browser. Type a question on the left, see the answer flow through both panels.

### Day 4 — Thursday, Mar 19: Demo 1 Polish + Approval Backend

- [ ] Polish Demo 1: make the inter-agent flow *visible* — show the routing step ("Searching for the right agent..."), show Karen's agent receiving the query, show the answer flowing back
- [ ] The magic is seeing the agents *talk to each other*. Add visual steps so a non-technical viewer understands what's happening.
- [ ] Build approval flow backend: when a DOC_REQUEST comes in, create a pending approval, expose it via WebSocket/SSE to the frontend
- [ ] Start wiring Demo 2 backend: file request → approval created → approval resolved → file "transferred"

**End of day**: Demo 1 is polished and impressive in the browser. Approval backend is ready for Demo 2.

### Day 5 — Friday, Mar 19: Demo 2 Frontend + Deploy

- [ ] Build the approval pop-up in the demo UI: Karen gets a notification, sees the request summary, clicks Approve/Deny
- [ ] Wire Demo 2 end-to-end:
  - User tells Jordan: "Get me the focus group results from Karen's team"
  - Jordan's agent → DOC_REQUEST → Karen's agent
  - Karen's panel shows the approval pop-up
  - Click Approve → file "delivered" → confirmation shown on both sides
- [ ] Add demo scenario selector: buttons to launch Demo 1 or Demo 2
- [ ] Deploy current state to Fly.io — both demos should be accessible on the live URL

**End of day**: Both demos work on the live URL. Rough around the edges but functional. Team does a Friday walkthrough.

---

### Weekend buffer

Muhammad takes a break or knocks out small fixes. No major features on weekends — that's how you burn out in Week 2 when it matters most.

---

### Day 6 — Monday, Mar 23: ETO Integration (Real)

- [ ] If using fallback messaging: swap in real ETO API now that the flow is proven
- [ ] Verify all inter-agent messages route through ETO with blockchain-verified delivery
- [ ] ETO file transfer: wire up the real file transfer for Demo 2 (replaces simulated transfer)
- [ ] Handle ETO edge cases: timeouts, retries, error states
- [ ] If ETO integration hits problems, keep the fallback working and flag to Likitha to coordinate with ETO team

**End of day**: Inter-agent communication runs through ETO. If ETO is still blocked, fallback works and the demo is unaffected.

### Day 7 — Tuesday, Mar 24: Visual Polish

- [ ] Agent avatars/icons for Jordan and Karen
- [ ] Loading states, typing animations, success confirmations
- [ ] Message transitions and smooth scrolling
- [ ] "Powered by e-agent" branding, clean typography
- [ ] Mobile/responsive check — demo needs to look good on Zoom screenshare
- [ ] Dark mode polish (already dark — refine it)

**End of day**: The demo looks like a product, not a prototype.

### Day 8 — Wednesday, Mar 25: Hardening

- [ ] Fix every bug on Likitha's QA list (she's been testing since Day 3)
- [ ] Handle unexpected inputs: what if someone types gibberish, SQL injection, a 5000-word message?
- [ ] Graceful error states: if Claude is slow, if ETO is down, show a clean error, not a crash
- [ ] Add "Reset Demo" button — clears all state for back-to-back demos
- [ ] Response time optimization: target < 3s for routing, < 5s for full answer
- [ ] Structured logging so you can debug issues during a live demo from your phone

**End of day**: Demo is bulletproof. Likitha can't break it.

### Day 9 — Thursday, Mar 26: Production Lockdown

- [ ] Final deploy to Fly.io with production environment variables
- [ ] SSL + custom domain (demo.e-agent.ai or similar)
- [ ] Pre-warm: make sure first request isn't slow (cold start issue on Fly.io)
- [ ] Run both demos 10 times on the live URL — every run must be clean
- [ ] Record a backup video of both demos in case of live demo failure
- [ ] Fix any last issues

**End of day**: Production is locked. No more code changes unless something is broken.

### Day 10 — Friday, Mar 27: Demo Day

- [ ] Morning: full dress rehearsal with Max driving the demo (Muhammad watches, doesn't touch the keyboard)
- [ ] Fix anything that breaks during rehearsal (last chance)
- [ ] Afternoon: Max delivers first real demo (or team does together)
- [ ] Team retro: what worked, what didn't, what did the audience react to

**End of day**: The demo has been delivered at least once to a real audience. Phase 1 planning begins.

---

## Day-by-Day: Likitha (Product, QA, Ops)

### Days 1-2
- [ ] Set up project board (Linear/Notion) with these exact tasks
- [ ] Write the demo script v1 — the *exact* questions to ask, the *exact* responses expected:
  - Demo 1: "Who owns Q4 revenue forecast?" → routing → answer
  - Demo 2: "Get me the focus group results from Karen's team" → approval → file shared
- [ ] Coordinate with ETO: confirm sandbox access, get API docs, establish a direct Slack/WhatsApp line with their eng contact
- [ ] Set up Fly.io account, configure environment variables, get domain ready
- [ ] Refine agent personas — make Jordan and Karen feel like real people, not templates

### Days 3-5
- [ ] Start QA the moment the frontend is up (Day 3) — test in Chrome, Safari, on a projector-sized window
- [ ] Log every bug, weird behavior, or confusing UX in the project board
- [ ] Refine demo script v2 based on what actually works vs. what was planned
- [ ] Test 10+ different questions for Demo 1 — find the ones that produce the most impressive responses
- [ ] Create the "golden path" — the 3-4 specific inputs that make the demo sing every time
- [ ] Draft the FAQ/objection doc for Max's conversations

### Days 6-8
- [ ] QA the ETO integration — verify messages are actually going through ETO, not the fallback
- [ ] Stress test: run both demos 20+ times. Note every failure.
- [ ] Time the demos — each scenario should complete in < 30 seconds
- [ ] Write the "demo day" runbook: step-by-step instructions so Max can drive without Muhammad
- [ ] Prepare the "how it works" explainer (2-3 slides for non-technical audiences)
- [ ] Create backup plan: screen recording of both demos in case live demo fails

### Days 9-10
- [ ] Final QA on production URL — run the full demo on the live site, not localhost
- [ ] Verify the reset button works for back-to-back demos
- [ ] Be on standby during Max's first live demo to flag issues in real-time
- [ ] Document every piece of audience feedback for Phase 1 planning

---

## Day-by-Day: Max (CEO)

### Days 1-3
- [ ] Lock in 3-5 demo meetings for Week 3 (March 30+) via Foundry network
- [ ] First pass at pitch deck — the demo is the centerpiece, slides are context around it
- [ ] 20-min architecture walkthrough with Muhammad (Day 1 or 2) — learn enough to explain the system credibly
- [ ] Listen in on Muhammad's coding session (at least 1 hour) — absorb how the system works

### Days 4-7
- [ ] Review the live demo on Day 5. Give feedback: "what would impress an investor?"
- [ ] Refine pitch deck based on the real demo (replace mockups with screenshots/recordings)
- [ ] Get feedback on positioning from 2-3 Foundry contacts — share a 30-second screen recording
- [ ] Confirm all demo meetings are scheduled

### Days 8-10
- [ ] Practice the full pitch 3 times with the live demo
- [ ] Do a dress rehearsal on Day 9 where Max drives the entire demo
- [ ] Deliver the first real demo on Day 10
- [ ] Collect feedback: what excited them, what confused them, what would they pay for

---

## Daily Syncs

| What | When | Who | Format |
|------|------|-----|--------|
| Morning standup | 9:30am, 5 min | Muhammad + Likitha | Async Slack or quick call: what I'm building today, what I need |
| End-of-day demo | 5:00pm, 10 min | Muhammad + Likitha | Screen recording or quick call: here's what works now |
| Max check-in | Every other day | Max + Muhammad or Likitha | 15 min: pipeline update, any feedback from contacts |
| Friday walkthrough | Friday 4pm | Everyone | 30 min: run the demo together, align on next week |

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| ETO sandbox not ready | Build on Redis pub/sub fallback first. Swap ETO in on Day 6. Demo works either way. |
| Claude API latency spikes | Cache common demo queries. Pre-warm the connection. Have a "demo mode" that uses cached responses as last resort. |
| Fly.io cold starts | Keep min_machines_running=1 in production. Pre-warm before demos. |
| Demo breaks live | Likitha has a screen recording backup. Max can narrate over the video. |
| Muhammad gets sick/blocked | Everything is deployed daily. Whatever is live on Day N-1 is the demo. |
| Audience asks about integrations | "Phase 1 — we're starting with [Google/Slack] based on design partner feedback." Likitha has the FAQ doc. |

---

## Scope: What's IN vs. OUT

### IN (must ship)
- Two agents with distinct, believable personas
- Demo 1: Knowledge routing — ask a question, see it route, get an answer
- Demo 2: File sharing — request a file, approval pop-up, one-click approve
- Split-screen UI showing both agents
- Inter-agent communication through ETO (or working fallback)
- Live on a public URL
- Reset button for back-to-back demos

### OUT (not in these 2 weeks)
- Real SaaS integrations (Google, Slack)
- Multi-tenant / auth / IdP sync
- Admin dashboard
- Voice interface
- Database persistence (in-memory is fine for demo)
- Mobile app
- More than 2 agents

---

## Definition of Done

The demo ships when ALL of these are true:
- [ ] Two agents visible in split-screen web UI with distinct personas
- [ ] Demo 1: question → routing → answer, visible flow, < 5 seconds
- [ ] Demo 2: file request → approval pop-up → approve → delivered, < 10 seconds
- [ ] Inter-agent messages route through ETO (blockchain-verified)
- [ ] Deployed to a public URL with SSL
- [ ] Demo resets and re-runs cleanly in < 10 seconds
- [ ] Max can drive the entire demo without Muhammad present
- [ ] Likitha has run both demos 20+ times with zero failures

---

## What Happens on March 30

Demo meetings begin. Based on feedback:
- Which demo resonated more? That's the Phase 1 wedge.
- What integrations did they ask for first?
- Bottoms-up or top-down deployment?
- Begin Phase 1 planning with real market signal.
