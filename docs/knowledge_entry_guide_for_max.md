# Knowledge Entry Guide — For Max

**What this is:** The demo agents need more data to feel real. We have 35 entries, need ~48. Each entry is a small piece of information that an agent "knows" — like what a real employee would have in their head. This doc tells you exactly what to write, in what format, and why each one matters.

**Time estimate:** 3-4 hours total. You can do this in any order.

**The golden rule:** The data doesn't need to be accurate. It needs to be *recognizable*. When the COO sees the demo, they should think "that sounds like my company" without us claiming it is. Plausible names, realistic timelines, specific numbers.

---

## How Each Entry Works

Every knowledge entry has this structure:

```
topic:         A short label (snake_case). Example: "budget_allocation"
category:      One of: project_status, blocker, dependency, metric, document_ref, process, contact, timeline
content:       1-3 sentences. This is the actual information. Be specific — names, dates, dollar amounts, percentages.
last_updated:  A recent date (use March 2026 dates)
visibility:    "public" (any agent can see) or "team" (only same department). Default to "public".
```

**Content tips:**
- Write like you're briefing someone in a hallway, not writing a report
- Include at least one specific number or date per entry
- Name real-sounding people, tools, and vendors
- If it references work another team owns, we can link it (Muhammad will handle that part)

---

## What's Already Written (Don't Duplicate These)

### Riley Chen — COO (8 entries, need 2-3 more)
Already has: Q2 goals, hiring pipeline, company KPIs, support backlog risk, board review prep, cross-team escalation process, investor contacts, Q2 planning deck reference.

### Jordan Park — Product Lead (9 entries, need 2-3 more)
Already has: marketplace redesign status, sprint 14 progress, launch criteria checklist, feature roadmap, designer assignments, feature adoption metrics, design system migration, feature request triage process, external design agency contact.

### Sam Torres — Engineering Lead (9 entries, need 2-3 more)
Already has: Stripe API blocker, sprint velocity, deployment pipeline, infrastructure costs, tech debt (auth module), CI/CD migration, Stripe technical contact, incident response SOP, code review turnaround.

### Alex Kumar — Ops Manager (9 entries, need 2-3 more)
Already has: Stripe vendor status, MSA/SLA details, seller onboarding funnel, support ticket breakdown, onboarding SOP, seller success program, KYC compliance deadline, Stripe account manager, Q2 ops hiring plan.

---

## Entries to Write

### Riley Chen — COO (write 3)

**1. Budget allocation breakdown**
- category: `metric`
- Why it matters: If the COO asks "what's our burn rate" or "where's the money going," Riley needs to know. This is the kind of question a real COO asks reflexively.
- What to include: Total monthly burn, breakdown by department (eng, product, ops, G&A), runway context, any recent changes. Use realistic numbers for a ~100 person marketplace company — think $400-600K/month total.
- Example tone: "Monthly burn: $480K. Engineering 42%, Operations 28%, Product 18%, G&A 12%. Runway: 14 months at current burn. Board approved 15% increase for Q2 hiring."

**2. Competitor landscape**
- category: `project_status`
- Why it matters: COOs think about competitive positioning constantly. If they ask "how do we compare to [competitor]" and the agent knows nothing, the demo feels shallow.
- What to include: Name 2-3 fictional but plausible competitors, what they're doing, where your simulated company is stronger/weaker. Make it feel like a real market.
- Example tone: "Main competitors: Vendora (raised Series B, $40M, aggressive on seller acquisition), MarketLayer (smaller, but better seller tools). Our edge: faster onboarding (3 days vs industry avg 7) and lower take rate (12% vs 15-18%). Risk: Vendora launched a seller dashboard last month that's getting good reviews."

**3. Company-wide OKRs**
- category: `project_status`
- Why it matters: Ties everything together. When the COO asks a broad question like "what are our priorities" or "what should I focus on," the agent needs a strategic frame to synthesize from.
- What to include: 3-4 company OKRs for Q2 with current progress. Mix of on-track and off-track to feel realistic.
- Example tone: "Q2 OKRs: (1) Launch marketplace redesign by May 15 — at risk (API blocker), (2) 500 active sellers by June 30 — 68% of goal (current: 340), (3) Reduce support resolution time to <1.5 days — off track (current: 2.3 days), (4) Close Series A prep materials — on track."

---

### Jordan Park — Product Lead (write 3)

**4. User research insights**
- category: `metric`
- Why it matters: If the COO asks "what are sellers/buyers saying" or "what's the feedback on X," Jordan needs real qualitative + quantitative data. This makes the agent feel like it has genuine product intelligence.
- What to include: Recent survey or interview results, NPS or satisfaction scores, top user complaints, a surprising insight. Use specific numbers.
- Example tone: "March seller survey (n=84): NPS 34 (up from 28). Top pain points: payout delays (47%), listing creation too slow (31%), no bulk edit (28%). Surprise finding: 62% of power sellers want an API, not a better dashboard. Buyer satisfaction: 4.1/5, down from 4.3 — main complaint is search relevance."

**5. A/B test results**
- category: `metric`
- Why it matters: Shows the company is data-driven. If the COO asks about a specific feature decision, Jordan can cite actual test results. Makes the whole org feel real.
- What to include: 1-2 recent A/B tests with variant descriptions, sample sizes, results, and the decision made. One should be a clear win, one ambiguous.
- Example tone: "Simplified listing flow test (March 1-21, n=1,240): reduced fields from 14 to 8. Result: 23% higher completion rate, but 11% more listings flagged for missing info. Decision: ship with smart defaults for dropped fields. Search ranking test: new algorithm shows +8% click-through but -3% conversion. Inconclusive — extending test 2 more weeks."

**6. Competitive product analysis**
- category: `project_status`
- Why it matters: Product leads always track what competitors are building. Gives the agent depth when the COO asks about product strategy or differentiation.
- What to include: What 1-2 competitors recently shipped, how it compares to your roadmap, any features you're behind on.
- Example tone: "Vendora shipped a seller analytics dashboard with real-time GMV tracking and automated pricing suggestions. We don't have either — our analytics are basic. MarketLayer launched multi-currency support last week (we have 8 votes for this in backlog). Recommendation: fast-follow on analytics post-redesign, defer multi-currency to Q3."

---

### Sam Torres — Engineering Lead (write 2-3)

**7. Team capacity and bandwidth**
- category: `metric`
- Why it matters: One of the most common COO questions is "can the team handle this?" or "do we have bandwidth for X?" Without this, the engineering agent sounds like it only knows about blockers.
- What to include: Team size, current allocation, who's on what, available bandwidth. Be specific about people.
- Example tone: "Engineering team: 6 engineers + Sam (lead). Allocation: 3 on marketplace redesign (blocked), 1 on bulk listing tool, 1 on CI/CD + infra, 1 out sick (back Thursday). Available bandwidth: effectively 0 until API docs arrive. If docs land April 2 as promised, full redesign team can start April 3. Intern starting April 14 (backend, Ohio State co-op)."

**8. Security audit status**
- category: `project_status`
- Why it matters: Enterprise COOs care about security. If they ask about compliance or security posture, the agent needs something to say. Also ties to the auth module tech debt entry.
- What to include: Last audit date, findings, remediation status, next audit. Mention the auth module connection.
- Example tone: "Last security audit: February 12 (conducted by NCC Group). 2 critical findings: (1) legacy auth module stores session tokens insecurely — remediation tied to auth refactor (5 eng-days, scheduled post-launch), (2) S3 bucket ACLs overly permissive — fixed March 3. 4 medium findings, 3 resolved, 1 in progress. Next audit: July. SOC 2 Type I target: Q4 2026."

**9. Performance benchmarks** (optional but adds depth)
- category: `metric`
- Why it matters: If anyone asks about site performance, page load times, or uptime, this gives a concrete answer.
- What to include: Uptime percentage, p95 latency, page load times, any recent improvements.
- Example tone: "Platform uptime: 99.92% (March). p95 API latency: 220ms (target: <300ms). Marketplace page load: 2.1s desktop, 3.4s mobile (target: <2.5s mobile — working on image optimization). Search API: 180ms avg. Payment processing: 99.97% success rate. One incident in March (CDN, 22 min)."

---

### Alex Kumar — Ops Manager (write 2-3)

**10. Customer churn and retention**
- category: `metric`
- Why it matters: The COO will 100% ask about this. Churn is the #1 operational metric for a marketplace. Without it, the ops agent feels incomplete.
- What to include: Monthly churn rate for both sellers and buyers, cohort data if possible, main reasons for churn, any retention efforts.
- Example tone: "Seller churn: 4.2% monthly (target: <3%). Top reasons: payout delays (34%), found another platform (28%), business closed (22%). Buyer churn: harder to measure — 30-day return rate is 71% (target: 80%). Churn is concentrated in first 30 days post-activation. Seller success program is reducing churn for enrolled sellers to 1.8%."

**11. Refund and dispute rates**
- category: `metric`
- Why it matters: Financial operations data. If the COO asks about payment health or trust/safety, the ops agent needs to know. Also connects to the Stripe relationship.
- What to include: Monthly dispute rate, refund rate, resolution time, any trends. Tie to Stripe.
- Example tone: "March disputes: 23 (0.4% of transactions — Stripe threshold is 1%). Refund rate: 3.1% ($65K). Top dispute reasons: item not as described (52%), delivery issues (30%). Average resolution: 5.2 days. Stripe risk review: passed (last review March 15). Refund rate trending down from 3.8% in January — new seller photo requirements helping."

**12. Vendor evaluation pipeline** (optional)
- category: `project_status`
- Why it matters: Shows ops is forward-looking, not just reactive. If the COO asks about tools or vendor decisions, this gives substance.
- What to include: Any vendors being evaluated, what for, timeline for decisions.
- Example tone: "Evaluating 2 vendors: (1) Zendesk vs Intercom for support — demos completed, Intercom preferred (better seller-facing features), decision by April 10. Current tool (Freshdesk) contract expires May 31. (2) Persona for KYC automation — pilot running with 50 sellers, 91% auto-approval rate vs 74% manual. Cost: $2,800/month. Decision pending engineering capacity for integration."

---

## After You're Done

Send the entries to Muhammad in this format (copy-paste friendly):

```
topic: budget_allocation
category: metric
content: Monthly burn: $480K. Engineering 42%, Operations 28%, Product 18%, G&A 12%. Runway: 14 months at current burn. Board approved 15% increase for Q2 hiring.
last_updated: 2026-03-28
visibility: public
```

Muhammad will plug them into the system and wire up any cross-references.

---

## Quick Reference — Categories

| Category | Use For | Example |
|----------|---------|---------|
| project_status | What's happening with a project/initiative | "Marketplace redesign is partially on track..." |
| blocker | Something stuck, blocked, at risk | "Engineering is blocked on API docs..." |
| dependency | One team depends on another team's work | "Design system migration needs engineering..." |
| metric | Numbers, KPIs, measurements | "Seller churn: 4.2% monthly..." |
| document_ref | Reference to a document that exists | "Stripe MSA signed March 1..." |
| process | How something works, SOPs, workflows | "Feature request triage runs weekly..." |
| contact | People, relationships, who to talk to | "Stripe account manager: Rachel Torres..." |
| timeline | Dates, deadlines, schedules | "Board review April 14, deck due April 10..." |
