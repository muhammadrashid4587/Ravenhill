"""Knowledge Graph — the routing brain per blueprint §2.10.

PERSON / TEAM / TOPIC nodes. COMMUNICATES_WITH, EXPERT_IN, REPORTS_TO,
MEMBER_OF, WORKS_ON edges. Postgres with JSONB attributes for orgs up to 500.
Edge weights grow incrementally per event, decay per §2.10.4 schedule.
"""
