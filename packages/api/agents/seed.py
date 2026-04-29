"""Demo seed data — 4 agents for a marketplace company design partner demo."""
from uuid import UUID

COO_ID = UUID("00000000-0000-0000-0000-000000000001")
PRODUCT_LEAD_ID = UUID("00000000-0000-0000-0000-000000000002")
ENG_LEAD_ID = UUID("00000000-0000-0000-0000-000000000003")
OPS_MANAGER_ID = UUID("00000000-0000-0000-0000-000000000004")

SEED_AGENTS = [
    {
        "id": COO_ID,
        "name": "Riley Chen",
        "role": "Chief Operating Officer",
        "role_description": (
            "Oversees all operational functions, Q2 planning, hiring, and "
            "cross-functional initiatives. Has visibility into all teams."
        ),
        "departments": ["Executive"],
        "knowledge_areas": [
            "strategy", "q2 goals", "hiring", "board reporting", "kpis",
            "cross-team coordination", "investor relations",
        ],
        "knowledge_entries": [
            {
                "topic": "q2_priorities",
                "category": "project_status",
                "content": (
                    "Three Q2 priorities: (1) Marketplace redesign — launch target "
                    "May 15, currently at risk due to Stripe API blocker. (2) Hit 500 "
                    "active sellers by end of June, currently at 340. (3) Reduce "
                    "infrastructure costs by 15% through the AWS optimization Sam's "
                    "team identified. All three tie to Series A narrative."
                ),
                "last_updated": "2026-03-28",
                "visibility": "public",
            },
            {
                "topic": "hiring_pipeline",
                "category": "project_status",
                "content": (
                    "Three open roles: senior backend engineer (2 finalists, offers "
                    "going out this week), support agent (sourcing, target start "
                    "April 21), and seller success manager (job posted March 18, 14 "
                    "applicants, screening in progress, target start May 5). Backend "
                    "hire is highest priority — team is at capacity."
                ),
                "last_updated": "2026-03-27",
                "visibility": "public",
            },
            {
                "topic": "company_kpis",
                "category": "metric",
                "content": (
                    "GMV is $2.1M/month, up 9% from Q1. Seller activation rate is "
                    "62% (target 75%). Support backlog is 340 open tickets with "
                    "2.3-day average resolution (target 1.5 days). Monthly active "
                    "buyers: 12,400. Take rate holding at 12%."
                ),
                "last_updated": "2026-03-29",
                "visibility": "public",
            },
            {
                "topic": "support_backlog_risk",
                "category": "blocker",
                "content": (
                    "Support backlog hit 340 tickets — highest it's been. Team is "
                    "understaffed (2 agents handling volume meant for 4). "
                    "Payout-related tickets are 38% of the queue and take longest "
                    "to resolve. Risk: seller retention drops if resolution stays "
                    "above 2 days. Mitigation depends on the new support agent hire "
                    "starting April 21."
                ),
                "last_updated": "2026-03-28",
                "visibility": "public",
                "references_agent": str(OPS_MANAGER_ID),
            },
            {
                "topic": "board_review_prep",
                "category": "timeline",
                "content": (
                    "Board review is April 14. Deck is due to investors by April 10. "
                    "Key narratives: marketplace redesign progress, path to 500 "
                    "sellers, and Series A readiness. Need final GMV numbers from "
                    "Alex and redesign status from Jordan by April 7. Sarah Park "
                    "from Sequoia specifically asked for a seller unit economics "
                    "slide."
                ),
                "last_updated": "2026-03-26",
                "visibility": "team",
            },
            {
                "topic": "cross_team_escalation_process",
                "category": "process",
                "content": (
                    "Any blocker older than 48 hours gets escalated to "
                    "#exec-escalations in Slack. Team leads post a one-liner with "
                    "owner, blocker description, and what they need. Riley reviews "
                    "daily at 9am. If it involves a vendor or external dependency, "
                    "Alex gets tagged automatically. No meeting required — async "
                    "first."
                ),
                "last_updated": "2026-03-15",
                "visibility": "public",
            },
            {
                "topic": "investor_contacts",
                "category": "contact",
                "content": (
                    "Primary investor relationships: Sarah Park at Sequoia (warm, "
                    "met at Founder Summit, interested in marketplace infra), David "
                    "Liu at YC (introduced through The Foundry network, wants to see "
                    "GMV trajectory). Both have seen the Q1 numbers. Next touchpoint "
                    "is the board deck on April 10."
                ),
                "last_updated": "2026-03-20",
                "visibility": "team",
            },
            {
                "topic": "q2_planning_deck",
                "category": "document_ref",
                "content": (
                    "Q2 planning deck finalized March 12. Total OpEx budget: $1.2M "
                    "for the quarter. Covers 8 new hires across engineering, ops, "
                    "and product. Infrastructure line item is $25.2K (3 months at "
                    "$8,400). Deck lives in the shared Google Drive under "
                    "/Strategy/Q2-2026."
                ),
                "last_updated": "2026-03-12",
                "visibility": "team",
            },
            {
                "topic": "budget_allocation",
                "category": "metric",
                "content": (
                    "Monthly burn is $480K — engineering takes 42%, ops 28%, product "
                    "18%, G&A 12%. Current runway is 14 months. Board approved a 15% "
                    "OpEx increase for Q2 to cover the 8 new hires."
                ),
                "last_updated": "2026-03-27",
                "visibility": "public",
            },
            {
                "topic": "competitor_landscape",
                "category": "project_status",
                "content": (
                    "Vendora closed a $40M Series B and is pushing hard on seller "
                    "acquisition with a new dashboard. MarketLayer is smaller but "
                    "just shipped multi-currency support. Our edge is onboarding "
                    "speed (3 days vs 7 industry avg) and take rate (12% vs "
                    "15-18%). Vendora's seller dashboard is the biggest near-term "
                    "threat."
                ),
                "last_updated": "2026-03-25",
                "visibility": "public",
            },
            {
                "topic": "company_okrs_q2",
                "category": "project_status",
                "content": (
                    "Q2 OKRs — (1) Ship marketplace redesign by May 15, currently "
                    "at risk due to API blocker. (2) Hit 500 active sellers by "
                    "June 30, sitting at 340 today (68%). (3) Cut support resolution "
                    "time to under 1.5 days, currently 2.3 days, off track. (4) "
                    "Series A prep materials — on track, deck outline done."
                ),
                "last_updated": "2026-03-29",
                "visibility": "public",
            },
        ],
        "topic_keys": [
            "q2_priorities", "q2_goals", "q2_planning", "quarterly_planning",
            "hiring_pipeline", "hiring",
            "company_kpis", "kpis",
            "support_backlog_risk", "support_backlog",
            "board_review_prep", "board_reporting",
            "cross_team_escalation_process", "cross_team_escalation",
            "investor_contacts", "investor_relations",
            "q2_planning_deck",
            "budget_allocation", "budget",
            "competitor_landscape", "competitors",
            "company_okrs_q2", "okrs",
            "strategy", "company_goals", "executive_summary",
            "q2_risks", "risks", "key_risks",
        ],
        "documents": [
            {
                "name": "Q2_Planning_Deck_v2.pdf",
                "description": (
                    "Q2 strategic priorities, budget allocations, and headcount plan."
                ),
                "requires_approval": True,
            },
        ],
        "trust_level": "auto",
        "seniority": "exec",
        "knowledge_base": "COO with visibility across all teams.",
        "scopes": ["read:public", "read:all"],
    },
    {
        "id": PRODUCT_LEAD_ID,
        "name": "Jordan Park",
        "role": "Product Lead",
        "role_description": (
            "Owns the product roadmap, feature prioritization, and the marketplace "
            "redesign project. Manages the design and PM team."
        ),
        "departments": ["Product"],
        "knowledge_areas": [
            "product roadmap", "feature status", "design",
            "sprint", "marketplace redesign", "user research",
        ],
        "knowledge_entries": [
            {
                "topic": "marketplace_redesign_status",
                "category": "project_status",
                "content": (
                    "Designs are approved and handed off. Dev is blocked — "
                    "engineering can't build the new seller dashboard without the "
                    "updated Stripe API docs. Front-end scaffolding is 40% done. "
                    "If the API blocker resolves by April 7, we can still hit "
                    "May 15 launch. If not, we're looking at a 2-3 week slip."
                ),
                "last_updated": "2026-03-28",
                "visibility": "public",
                "references_agent": str(ENG_LEAD_ID),
            },
            {
                "topic": "sprint_14_progress",
                "category": "project_status",
                "content": (
                    "Sprint 14 is at 8 of 12 story points completed. Two items "
                    "blocked: seller dashboard component (Stripe API) and design "
                    "system button migration (waiting on engineering bandwidth). "
                    "Remaining 2 points are on track to close by end of sprint "
                    "Friday."
                ),
                "last_updated": "2026-03-28",
                "visibility": "public",
            },
            {
                "topic": "launch_criteria_checklist",
                "category": "timeline",
                "content": (
                    "Marketplace redesign launch target is May 15. Five criteria "
                    "must be met: (1) Stripe API integration complete, (2) seller "
                    "dashboard passes QA, (3) design system migration at 80%+, "
                    "(4) load testing under 2.5s page load, (5) seller comms sent "
                    "7 days pre-launch. Currently at risk — if API blocker isn't "
                    "resolved by April 7, the May 15 date slips."
                ),
                "last_updated": "2026-03-27",
                "visibility": "public",
            },
            {
                "topic": "feature_roadmap",
                "category": "project_status",
                "content": (
                    "Three features in motion: seller dashboard is blocked on "
                    "Stripe API docs, bulk listing tool is in active development "
                    "(70% complete, on track for April release), and buyer review "
                    "redesign is in design phase with Forma Studio handling UX "
                    "research. Nothing else starts until the redesign ships."
                ),
                "last_updated": "2026-03-26",
                "visibility": "public",
            },
            {
                "topic": "designer_assignments",
                "category": "metric",
                "content": (
                    "Maya Okonkwo is at 110% capacity — she's covering the "
                    "marketplace redesign, the buyer review UX work with Forma "
                    "Studio, and the design system migration. No other designers "
                    "on staff. Risk: if anything slips or a new request comes in, "
                    "Maya is the bottleneck. Discussed hiring a contract designer "
                    "but deferred to Q3."
                ),
                "last_updated": "2026-03-25",
                "visibility": "public",
            },
            {
                "topic": "feature_adoption_metrics",
                "category": "metric",
                "content": (
                    "Current feature adoption rates: bulk listing tool at 34% of "
                    "active sellers (launched 6 weeks ago), saved search at 62% of "
                    "active buyers, analytics dashboard at 28% of sellers. Bulk "
                    "listing is underperforming — onboarding flow doesn't surface "
                    "it. Saved search is the strongest organic adoption we've had."
                ),
                "last_updated": "2026-03-24",
                "visibility": "public",
            },
            {
                "topic": "design_system_migration",
                "category": "project_status",
                "content": (
                    "Design system migration is 60% complete — 14 of 23 components "
                    "converted to the new system. Remaining 9 components need "
                    "engineering time to refactor. Blocked on engineering bandwidth "
                    "(team is focused on marketplace redesign). Target: 80% by "
                    "May 15 launch, 100% by end of Q2."
                ),
                "last_updated": "2026-03-23",
                "visibility": "public",
                "references_agent": str(ENG_LEAD_ID),
            },
            {
                "topic": "feature_request_triage",
                "category": "process",
                "content": (
                    "Feature request triage runs weekly on Tuesdays. Current "
                    "backlog: 47 requests. Top voted: multi-currency support (8 "
                    "votes from sellers, MarketLayer just shipped this). Jordan "
                    "prioritizes based on seller impact and engineering effort. "
                    "Requests older than 90 days without traction get archived."
                ),
                "last_updated": "2026-03-25",
                "visibility": "public",
            },
            {
                "topic": "external_design_agency",
                "category": "contact",
                "content": (
                    "Forma Studio is handling buyer review UX research — contract "
                    "is $18K for a 6-week engagement starting March 10. "
                    "Deliverables: user journey map, 12 seller interviews, "
                    "prototype for buyer review flow. Point of contact is Priya "
                    "Anand. Final deliverable due April 21."
                ),
                "last_updated": "2026-03-18",
                "visibility": "public",
            },
            {
                "topic": "seller_survey_march",
                "category": "metric",
                "content": (
                    "March seller survey (n=84) came back NPS 34, up from 28 in "
                    "February. Biggest pain points: payout delays (47%), listing "
                    "creation too slow (31%), no bulk edit option (28%). Surprise: "
                    "62% of power sellers want an API, not a better dashboard. "
                    "Buyer satisfaction dipped to 4.1/5 from 4.3."
                ),
                "last_updated": "2026-03-24",
                "visibility": "public",
            },
            {
                "topic": "ab_test_listing_flow",
                "category": "metric",
                "content": (
                    "Simplified listing flow test ran March 1-21 (n=1,240). Cut "
                    "fields from 14 to 8 — completions up 23% but flagged listings "
                    "up 11% from missing info. Decision: ship with smart defaults "
                    "to close the gap. Search ranking A/B showed +8% CTR but -3% "
                    "conversion, inconclusive — extending two more weeks."
                ),
                "last_updated": "2026-03-22",
                "visibility": "public",
            },
            {
                "topic": "competitive_product_intel",
                "category": "project_status",
                "content": (
                    "Vendora shipped real-time GMV tracking and automated pricing "
                    "suggestions for sellers — we have neither on the roadmap until "
                    "post-redesign. MarketLayer launched multi-currency last week, "
                    "which has 8 feature votes in our backlog. Recommendation is "
                    "fast-follow on seller analytics after May launch and push "
                    "multi-currency to Q3."
                ),
                "last_updated": "2026-03-26",
                "visibility": "public",
                "references_agent": str(COO_ID),
            },
        ],
        "topic_keys": [
            "marketplace_redesign_status", "marketplace_redesign",
            "platform_redesign", "marketplace_update",
            "sprint_14_progress", "sprint_progress",
            "launch_criteria_checklist", "launch_criteria",
            "feature_roadmap", "feature_status", "feature_prioritization",
            "product_roadmap",
            "designer_assignments",
            "feature_adoption_metrics", "feature_adoption",
            "design_system_migration",
            "feature_request_triage",
            "external_design_agency",
            "seller_survey_march", "seller_survey",
            "ab_test_listing_flow", "ab_test",
            "competitive_product_intel", "competitive_intel",
            "q2_planning",
            "product_launch", "launch_status", "launch_timeline",
        ],
        "documents": [
            {
                "name": "Product_Spec_Marketplace_Redesign_v3.pdf",
                "description": (
                    "Full feature spec for the marketplace redesign, including scope, "
                    "UX flows, and acceptance criteria."
                ),
                "requires_approval": False,
            },
            {
                "name": "Sprint_14_Board.md",
                "description": (
                    "Current sprint status, ticket breakdown, and blockers."
                ),
                "requires_approval": False,
            },
        ],
        "trust_level": "auto",
        "seniority": "lead",
        "knowledge_base": "Product Lead managing marketplace redesign.",
        "scopes": ["read:public", "read:product", "write:product"],
    },
    {
        "id": ENG_LEAD_ID,
        "name": "Sam Torres",
        "role": "Engineering Lead",
        "role_description": (
            "Leads the engineering team, manages technical architecture, deployment, "
            "and API integrations. Owns sprint velocity and infrastructure."
        ),
        "departments": ["Engineering"],
        "knowledge_areas": [
            "api dependencies", "sprint velocity", "deployment",
            "infrastructure", "tech debt", "CI/CD", "incident response",
        ],
        "knowledge_entries": [
            {
                "topic": "stripe_api_blocker",
                "category": "blocker",
                "content": (
                    "Stripe API documentation for the updated payout endpoints has "
                    "been missing since March 26. This is on the critical path — "
                    "the seller dashboard can't be built without it. Three engineers "
                    "are blocked. Marcus Webb at Stripe is the point of contact. "
                    "Escalation path goes through Kenji Nakamura if docs aren't "
                    "delivered by April 2."
                ),
                "last_updated": "2026-03-28",
                "visibility": "public",
                "references_agent": str(OPS_MANAGER_ID),
            },
            {
                "topic": "sprint_velocity",
                "category": "metric",
                "content": (
                    "Sprint 14 velocity: 8 of 12 story points completed, 67%. One "
                    "engineer out sick since Tuesday (back Thursday). Without the "
                    "Stripe blocker, velocity would be on track. Rolling 4-sprint "
                    "average is 10.5 points. Team is not underperforming — they're "
                    "blocked."
                ),
                "last_updated": "2026-03-28",
                "visibility": "public",
            },
            {
                "topic": "deployment_pipeline",
                "category": "process",
                "content": (
                    "Deployments run through GitHub Actions. Last production deploy "
                    "was March 21. Next scheduled deploy is April 4 (bulk listing "
                    "tool updates). Deploys require passing CI, one approval, and "
                    "a 15-minute staging soak. Rollback takes under 5 minutes. No "
                    "deploy freezes currently in effect."
                ),
                "last_updated": "2026-03-22",
                "visibility": "public",
            },
            {
                "topic": "infrastructure_costs",
                "category": "metric",
                "content": (
                    "Current infrastructure spend is $8,400/month, up 12% from Q1 "
                    "due to increased API traffic and staging environments. Sam "
                    "identified an optimization — consolidating 3 underused EC2 "
                    "instances and moving static assets to CloudFront — estimated "
                    "savings of $1,200/month. Needs 2 engineering days to implement, "
                    "scheduled for post-redesign."
                ),
                "last_updated": "2026-03-25",
                "visibility": "public",
            },
            {
                "topic": "tech_debt_auth_module",
                "category": "blocker",
                "content": (
                    "Legacy auth module stores session tokens insecurely — flagged "
                    "as critical in the February security audit. Refactor estimated "
                    "at 5 engineering days. Currently deferred because all bandwidth "
                    "is on the marketplace redesign. Security risk increases the "
                    "longer it sits. If deferred past July audit, it becomes a "
                    "compliance issue for SOC 2."
                ),
                "last_updated": "2026-03-20",
                "visibility": "public",
            },
            {
                "topic": "cicd_migration",
                "category": "project_status",
                "content": (
                    "Migrating CI/CD from Jenkins to GitHub Actions. Build times "
                    "dropped from 14 minutes to 6 minutes. Migration is 85% "
                    "complete — 2 remaining pipelines (staging deploy and nightly "
                    "regression) still on Jenkins. Full cutover targeted for "
                    "mid-April. Jenkins server will be decommissioned after cutover "
                    "saves $340/month."
                ),
                "last_updated": "2026-03-24",
                "visibility": "public",
            },
            {
                "topic": "stripe_technical_contact",
                "category": "contact",
                "content": (
                    "Primary Stripe technical contact is Marcus Webb (solutions "
                    "engineer). He's been responsive but hasn't delivered the "
                    "updated API docs yet. Escalation path: if Marcus doesn't "
                    "resolve by April 2, go through Kenji Nakamura (Stripe "
                    "engineering manager, introduced through Rachel Torres on the "
                    "ops side)."
                ),
                "last_updated": "2026-03-27",
                "visibility": "public",
                "references_agent": str(OPS_MANAGER_ID),
            },
            {
                "topic": "incident_response_sop",
                "category": "process",
                "content": (
                    "P1 incidents (site down, data loss risk) trigger immediate "
                    "all-hands in #incident-response, 15-minute status updates, "
                    "postmortem within 48 hours. P2 incidents (degraded performance, "
                    "partial outage) handled by on-call engineer with 1-hour "
                    "response SLA. Last P1 was March 8 (database failover, resolved "
                    "in 34 minutes). On-call rotation is weekly."
                ),
                "last_updated": "2026-03-15",
                "visibility": "public",
            },
            {
                "topic": "code_review_turnaround",
                "category": "metric",
                "content": (
                    "Median code review turnaround is 4.2 hours, target is under "
                    "4 hours. Main bottleneck is Sam reviewing most PRs himself — "
                    "working on distributing reviews more evenly now that the CI/CD "
                    "migration freed up process. Goal is to get median under 3.5 "
                    "hours by end of Q2."
                ),
                "last_updated": "2026-03-26",
                "visibility": "public",
            },
            {
                "topic": "team_capacity",
                "category": "metric",
                "content": (
                    "Team is 6 engineers plus Sam. Current allocation: 3 on "
                    "marketplace redesign (blocked on Stripe API docs), 1 on bulk "
                    "listing tool, 1 on CI/CD migration and infra, 1 out sick "
                    "returning Thursday. Effective available bandwidth is zero "
                    "until API docs arrive. Backend intern from Ohio State starts "
                    "April 14."
                ),
                "last_updated": "2026-03-28",
                "visibility": "public",
            },
            {
                "topic": "security_audit_status",
                "category": "project_status",
                "content": (
                    "Last external audit was February 12 by NCC Group. Two critical "
                    "findings: legacy auth module stores session tokens insecurely "
                    "(tied to the auth refactor in tech debt backlog), and S3 bucket "
                    "ACLs were overly permissive (fixed March 3). Next audit "
                    "scheduled for July. SOC 2 Type I target is Q4 2026."
                ),
                "last_updated": "2026-03-20",
                "visibility": "public",
            },
            {
                "topic": "platform_performance",
                "category": "metric",
                "content": (
                    "March uptime: 99.92%. p95 API latency: 220ms. Marketplace "
                    "page load is 2.1s on desktop and 3.4s on mobile (target is "
                    "sub-2.5s). Payment processing success rate: 99.97%. One "
                    "incident in March — CDN outage, 22 minutes, no data loss."
                ),
                "last_updated": "2026-03-29",
                "visibility": "public",
            },
        ],
        "topic_keys": [
            "stripe_api_blocker", "api_dependencies", "api_integrations",
            "blockers",
            "sprint_velocity", "sprint_progress",
            "deployment_pipeline", "deployment",
            "infrastructure_costs", "infrastructure",
            "tech_debt_auth_module", "tech_debt",
            "cicd_migration", "cicd_pipeline",
            "stripe_technical_contact",
            "incident_response_sop", "incident_response",
            "code_review_turnaround", "code_review",
            "team_capacity", "team_bandwidth",
            "security_audit_status", "security_audit",
            "platform_performance", "performance",
            "marketplace_redesign",
        ],
        "documents": [
            {
                "name": "API_Integration_Spec_Stripe_Connect.pdf",
                "description": (
                    "Technical integration spec for Stripe Connect seller payout API. "
                    "Waiting on vendor docs to complete."
                ),
                "requires_approval": False,
            },
        ],
        "trust_level": "auto",
        "seniority": "lead",
        "knowledge_base": "Engineering Lead managing API integrations and sprint.",
        "scopes": ["read:public", "read:engineering", "write:engineering"],
    },
    {
        "id": OPS_MANAGER_ID,
        "name": "Alex Kumar",
        "role": "Operations Manager",
        "role_description": (
            "Manages seller onboarding, vendor relationships, customer support "
            "operations, and process documentation."
        ),
        "departments": ["Operations"],
        "knowledge_areas": [
            "seller onboarding", "vendor management",
            "customer support", "process docs", "KYC compliance",
        ],
        "knowledge_entries": [
            {
                "topic": "stripe_vendor_status",
                "category": "project_status",
                "content": (
                    "Stripe confirmed API docs will be delivered by April 2. Marcus "
                    "Webb is the assigned solutions engineer on their side. Alex "
                    "followed up March 28 and got written confirmation. If docs "
                    "don't arrive April 2, escalation goes to Kenji Nakamura "
                    "through Rachel Torres."
                ),
                "last_updated": "2026-03-28",
                "visibility": "public",
                "references_agent": str(ENG_LEAD_ID),
            },
            {
                "topic": "stripe_msa_sla",
                "category": "document_ref",
                "content": (
                    "Stripe MSA was signed March 1. Includes a 30-day SLA for "
                    "technical deliverables. The API documentation request was "
                    "submitted March 3, which means the SLA breach date is April 2. "
                    "If they miss it, we have grounds to escalate formally and "
                    "renegotiate terms at the April 8 QBR."
                ),
                "last_updated": "2026-03-20",
                "visibility": "public",
            },
            {
                "topic": "seller_onboarding_funnel",
                "category": "metric",
                "content": (
                    "March funnel: 180 applications received, 110 approved (61% "
                    "approval rate), 68 activated (62% activation rate). Drop-off "
                    "is highest between approval and activation — sellers stall on "
                    "KYC verification and listing their first product. Onboarding "
                    "SOP is being updated to add a guided first-listing flow."
                ),
                "last_updated": "2026-03-28",
                "visibility": "public",
            },
            {
                "topic": "support_ticket_breakdown",
                "category": "metric",
                "content": (
                    "340 open tickets as of March 28. Breakdown: payout issues 38%, "
                    "listing problems 24%, account access 18%, buyer disputes 12%, "
                    "other 8%. Average resolution time is 2.3 days (target 1.5). "
                    "Payout tickets take longest at 3.1 days average because they "
                    "require Stripe coordination."
                ),
                "last_updated": "2026-03-28",
                "visibility": "public",
            },
            {
                "topic": "onboarding_sop",
                "category": "process",
                "content": (
                    "Current seller onboarding SOP: application review (1 business "
                    "day), KYC verification (2-3 days via manual process), account "
                    "activation, guided first listing. KYC step needs updating by "
                    "April 1 to comply with new verification requirements. 23 "
                    "existing sellers also need re-verification by that date."
                ),
                "last_updated": "2026-03-25",
                "visibility": "public",
            },
            {
                "topic": "seller_success_program",
                "category": "project_status",
                "content": (
                    "Seller success program currently covers top 20 sellers by GMV. "
                    "Those sellers saw +22% GMV growth after enrollment. Program "
                    "includes a dedicated ops contact, priority support, and monthly "
                    "performance reviews. Expanding to top 50 sellers in Q2 — will "
                    "need the new seller success manager hire (target start May 5)."
                ),
                "last_updated": "2026-03-24",
                "visibility": "public",
            },
            {
                "topic": "kyc_compliance_deadline",
                "category": "timeline",
                "content": (
                    "April 1 deadline for updated KYC compliance requirements. 23 "
                    "existing sellers need re-verification — 15 have submitted "
                    "updated docs, 8 are outstanding. If they miss the deadline, "
                    "their accounts get flagged (not suspended) and they have a "
                    "14-day grace period. Alex is sending final reminder emails "
                    "March 30."
                ),
                "last_updated": "2026-03-28",
                "visibility": "public",
            },
            {
                "topic": "stripe_account_manager",
                "category": "contact",
                "content": (
                    "Stripe account manager is Rachel Torres. Quarterly business "
                    "review is April 8 — agenda includes pricing renegotiation "
                    "(current rate is 2.9% + 30 cents, pushing for volume discount "
                    "at our transaction levels), API documentation SLA breach, and "
                    "roadmap for new payout endpoints. Rachel has been responsive "
                    "and supportive."
                ),
                "last_updated": "2026-03-26",
                "visibility": "public",
            },
            {
                "topic": "q2_ops_hiring_plan",
                "category": "timeline",
                "content": (
                    "Two ops hires planned for Q2: (1) Support agent — sourcing "
                    "now, target start April 21, will bring support team from 2 to "
                    "3 and directly address the ticket backlog. (2) Seller success "
                    "manager — 14 applicants, screening in progress, target start "
                    "May 5, needed for the program expansion from 20 to 50 sellers."
                ),
                "last_updated": "2026-03-27",
                "visibility": "public",
            },
            {
                "topic": "seller_churn_retention",
                "category": "metric",
                "content": (
                    "Seller churn is 4.2% monthly, target is under 3%. Top reasons: "
                    "payout delays (34%), switched to another platform (28%), "
                    "business closed (22%). Churn is concentrated in the first 30 "
                    "days. Seller success program members churn at only 1.8%. Buyer "
                    "30-day return rate is 71%, target is 80%."
                ),
                "last_updated": "2026-03-28",
                "visibility": "public",
            },
            {
                "topic": "refund_dispute_rates",
                "category": "metric",
                "content": (
                    "March disputes: 23 total, which is 0.4% of transactions — well "
                    "under Stripe's 1% threshold. Refund rate: 3.1% ($65K). Top "
                    "dispute reasons: item not as described (52%), delivery issues "
                    "(30%). Average resolution takes 5.2 days. Trending down from "
                    "3.8% in January after new seller photo requirements."
                ),
                "last_updated": "2026-03-27",
                "visibility": "public",
            },
            {
                "topic": "vendor_evaluation_pipeline",
                "category": "project_status",
                "content": (
                    "Two active evaluations: (1) Zendesk vs Intercom for support "
                    "tooling — leaning Intercom, decision due April 10, current "
                    "Freshdesk contract expires May 31. (2) Persona for KYC "
                    "automation — pilot with 50 sellers showed 91% auto-approval "
                    "vs 74% manual. Persona cost is $2,800/month."
                ),
                "last_updated": "2026-03-26",
                "visibility": "public",
            },
            {
                "topic": "warehouse_fulfillment_status",
                "category": "project_status",
                "content": (
                    "Current fulfillment partner is ShipRight — handling 78% of "
                    "orders. On-time delivery rate is 94% (target 97%). Evaluating "
                    "FleetLogix as a secondary partner for West Coast orders, which "
                    "currently average 4.8 days vs 2.1 days for East Coast. Pilot "
                    "proposal from FleetLogix is $3.20/order, decision by April 15."
                ),
                "last_updated": "2026-03-25",
                "visibility": "public",
            },
        ],
        "topic_keys": [
            "stripe_vendor_status", "vendor_management", "vendor_contracts",
            "vendor_relationship",
            "stripe_msa_sla",
            "seller_onboarding_funnel", "seller_onboarding", "seller_experience",
            "new_seller_setup",
            "support_ticket_breakdown", "support_tickets", "customer_support",
            "support_backlog", "ticket_backlog",
            "onboarding_sop", "process_docs",
            "seller_success_program",
            "kyc_compliance_deadline", "kyc_compliance",
            "stripe_account_manager", "stripe_relationship",
            "q2_ops_hiring_plan", "q2_ops_hiring",
            "seller_churn_retention", "seller_churn",
            "refund_dispute_rates", "refund_disputes",
            "vendor_evaluation_pipeline", "vendor_evaluation",
            "warehouse_fulfillment_status", "fulfillment", "warehouse",
        ],
        "documents": [
            {
                "name": "Stripe_Connect_MSA_March2026.pdf",
                "description": (
                    "Master Service Agreement with Stripe Connect for seller payout "
                    "processing. Contains SLA terms."
                ),
                "requires_approval": True,
            },
            {
                "name": "Seller_Onboarding_SOP_v4.pdf",
                "description": (
                    "Standard operating procedure for seller onboarding, including "
                    "KYC requirements and payout setup."
                ),
                "requires_approval": False,
            },
        ],
        "trust_level": "approve",
        "seniority": "lead",
        "knowledge_base": (
            "Operations Manager managing vendor relationships and seller onboarding."
        ),
        "scopes": ["read:public", "read:operations", "write:operations"],
    },
]
