"""Agent Eval Harness — does the agent behave like a smart employee?

NOT a unit test suite. This measures emergent behavior across 5 dimensions:

1. ROUTING   — Did it find the right people without being told who to ask?
2. CHAINING  — Did it follow cross-references to the next agent?
3. SYNTHESIS — Is the answer decision-ready (specific facts, no parrot)?
4. UNKNOWNS  — Does it gracefully say "I don't know" vs. hallucinate?
5. ACTIONS   — Does it correctly trigger doc requests / notifications?

Run: pytest tests/test_eval.py -v
Or standalone: python tests/test_eval.py  (prints scorecard)
"""

import asyncio
import time

import pytest

from agents.seed import COO_ID, PRODUCT_LEAD_ID, ENG_LEAD_ID, OPS_MANAGER_ID
from orchestrator import orchestrate, OrchestrateRequest

# ---------------------------------------------------------------------------
# Eval case definitions
# ---------------------------------------------------------------------------

AGENT_IDS = {
    "riley": str(COO_ID),
    "jordan": str(PRODUCT_LEAD_ID),
    "sam": str(ENG_LEAD_ID),
    "alex": str(OPS_MANAGER_ID),
}


class EvalCase:
    """One eval scenario with expected behavior."""

    def __init__(
        self,
        name: str,
        dimension: str,
        question: str,
        *,
        expect_agents: list[str] | None = None,
        expect_not_agents: list[str] | None = None,
        expect_intent: str | None = None,
        expect_second_hop: bool | None = None,
        expect_approval: bool | None = None,
        expect_facts: list[str] | None = None,
        expect_no_answer: bool = False,
        expect_answer_contains: list[str] | None = None,
        expect_answer_absent: list[str] | None = None,
    ):
        self.name = name
        self.dimension = dimension
        self.question = question
        self.expect_agents = expect_agents or []
        self.expect_not_agents = expect_not_agents or []
        self.expect_intent = expect_intent
        self.expect_second_hop = expect_second_hop
        self.expect_approval = expect_approval
        self.expect_facts = expect_facts or []
        self.expect_no_answer = expect_no_answer
        self.expect_answer_contains = expect_answer_contains or []
        self.expect_answer_absent = expect_answer_absent or []


# ---------------------------------------------------------------------------
# DIMENSION 1: ROUTING — find the right people without hints
# ---------------------------------------------------------------------------

ROUTING_CASES = [
    EvalCase(
        "vague_behind_schedule",
        "routing",
        "Why is everything behind schedule?",
        # Should find at least one of Sam (blockers) or Jordan (sprint)
        expect_not_agents=["riley"],
    ),
    EvalCase(
        "marketplace_no_names",
        "routing",
        "How's the big product launch looking?",
        expect_agents=["jordan"],
    ),
    EvalCase(
        "money_question",
        "routing",
        "What are we spending on infrastructure?",
        expect_agents=["sam"],
    ),
    EvalCase(
        "seller_health",
        "routing",
        "How are our sellers doing?",
        expect_agents=["alex"],
    ),
    EvalCase(
        "cross_functional",
        "routing",
        "Are we on track for the marketplace redesign?",
        # Should find at least Jordan (Product) — Sam is a bonus
        expect_agents=["jordan"],
    ),
    EvalCase(
        "hiring_status",
        "routing",
        "Where are we on hiring?",
        # Riley has hiring info, but since she's the source, it should
        # route to someone else OR answer from Riley's own knowledge
        expect_agents=[],  # flexible — any agent with hiring info
    ),
    EvalCase(
        "support_crisis",
        "routing",
        "Our support backlog seems to be growing, what's going on?",
        expect_agents=["alex"],
    ),
    EvalCase(
        "deployment_question",
        "routing",
        "When's the next deploy?",
        expect_agents=["sam"],
    ),
]

# ---------------------------------------------------------------------------
# DIMENSION 2: CHAINING — follow the thread across agents
# ---------------------------------------------------------------------------

CHAINING_CASES = [
    EvalCase(
        "api_blocker_chains_to_ops",
        "chaining",
        "What's the status on the API blocker?",
        expect_agents=["sam"],
        expect_second_hop=True,
        # Engineering's entry references OPS for vendor status
    ),
    EvalCase(
        "redesign_chains_to_eng",
        "chaining",
        "Is the design system migration going to delay the redesign?",
        expect_agents=["jordan"],
        expect_second_hop=True,
        # Product's design_system_migration entry references ENG
    ),
    EvalCase(
        "support_backlog_chains",
        "chaining",
        "The support backlog is getting worse, what's the root cause?",
        # Riley has support_backlog_risk which references OPS
        # Or Alex directly discusses it
        expect_second_hop=None,  # flexible
    ),
    EvalCase(
        "competitor_chains_to_product",
        "chaining",
        "What's Vendora doing that we should worry about?",
        # Both Riley and Jordan have competitor info — either is valid routing
        expect_agents=[],
        expect_answer_contains=["vendora"],
    ),
]

# ---------------------------------------------------------------------------
# DIMENSION 3: SYNTHESIS — decision-ready, not parroting
# ---------------------------------------------------------------------------

SYNTHESIS_CASES = [
    EvalCase(
        "specific_numbers",
        "synthesis",
        "How's seller onboarding going — what are the numbers?",
        # Routes to Alex (Ops) who has concrete funnel metrics
        expect_agents=["alex"],
    ),
    EvalCase(
        "risk_highlighted",
        "synthesis",
        "What's at risk with the marketplace redesign?",
        # "redesign" + "risk" should route to Product/Engineering
        expect_answer_absent=["nobody has information"],
    ),
    EvalCase(
        "dates_and_names",
        "synthesis",
        "What's the Stripe situation exactly?",
        expect_answer_contains=["april"],
        expect_facts=["marcus", "april 2"],
        # Should mention Marcus Webb, April 2 delivery date
    ),
    EvalCase(
        "multi_agent_coherent",
        "synthesis",
        "Are we on track for the marketplace redesign?",
        # Should find at least Jordan — answer should mention the blocker
        expect_agents=["jordan"],
        expect_answer_absent=["nobody has information"],
    ),
    EvalCase(
        "actionable_not_vague",
        "synthesis",
        "What should I focus on this week?",
        # Should give specific action items, not generic advice
        expect_answer_absent=["I don't have"],
    ),
]

# ---------------------------------------------------------------------------
# DIMENSION 4: UNKNOWNS — graceful "I don't know"
# ---------------------------------------------------------------------------

UNKNOWN_CASES = [
    EvalCase(
        "no_ceo_agent",
        "unknowns",
        "What's the CEO's schedule this week?",
        expect_no_answer=True,
    ),
    EvalCase(
        "nonexistent_project",
        "unknowns",
        "How's Project Phoenix going?",
        # LLM may infer this is the main project (smart inference) OR say unknown
        # Both are acceptable — what matters is it doesn't make up fake details
        expect_answer_absent=["phoenix is complete", "phoenix launched"],
    ),
    EvalCase(
        "wrong_department",
        "unknowns",
        "What's our legal team saying about the contract?",
        # No legal agent exists — should say it can't find anyone
        # OR route to Alex (Ops) who has the MSA, which is acceptable
    ),
    EvalCase(
        "future_knowledge",
        "unknowns",
        "What happened in last month's all-hands?",
        # No knowledge about all-hands meetings
        expect_no_answer=True,
    ),
]

# ---------------------------------------------------------------------------
# DIMENSION 5: ACTIONS — doc requests, notifications
# ---------------------------------------------------------------------------

ACTION_CASES = [
    EvalCase(
        "doc_request_vendor_contract",
        "actions",
        "Get me the Stripe vendor contract from ops.",
        expect_intent="action_request",
        expect_approval=True,
    ),
    EvalCase(
        "doc_request_product_spec",
        "actions",
        "Can I see the marketplace redesign spec?",
        expect_intent="action_request",
    ),
    EvalCase(
        "notification_to_engineering",
        "actions",
        "Let Sam know the board review is April 14.",
        expect_intent="action_request",
        expect_approval=False,
    ),
    EvalCase(
        "doc_request_vague",
        "actions",
        "Share the onboarding doc with me.",
        expect_intent="action_request",
    ),
    EvalCase(
        "notification_ops",
        "actions",
        "Give Alex a heads up that the KYC deadline is tomorrow.",
        expect_intent="action_request",
        expect_approval=False,
    ),
]

ALL_CASES = ROUTING_CASES + CHAINING_CASES + SYNTHESIS_CASES + UNKNOWN_CASES + ACTION_CASES


# ---------------------------------------------------------------------------
# Scoring engine
# ---------------------------------------------------------------------------

class EvalResult:
    """Result of running one eval case."""

    def __init__(self, case: EvalCase):
        self.case = case
        self.passed_checks: list[str] = []
        self.failed_checks: list[str] = []
        self.response = None
        self.elapsed = 0.0

    @property
    def total_checks(self) -> int:
        return len(self.passed_checks) + len(self.failed_checks)

    @property
    def passed(self) -> bool:
        return len(self.failed_checks) == 0

    def check(self, name: str, condition: bool, detail: str = ""):
        if condition:
            self.passed_checks.append(name)
        else:
            self.failed_checks.append(f"{name}: {detail}" if detail else name)


def _sources_contain_agent(sources: list[str], agent_key: str) -> bool:
    """Check if any source label mentions the expected agent."""
    name_map = {
        "riley": "riley chen",
        "jordan": "jordan park",
        "sam": "sam torres",
        "alex": "alex kumar",
    }
    target = name_map.get(agent_key, agent_key).lower()
    return any(target in s.lower() for s in sources)


def score_case(case: EvalCase, resp) -> EvalResult:
    """Score an orchestrator response against expected behavior."""
    result = EvalResult(case)
    result.response = resp

    answer = (resp.answer or "").lower()
    sources = resp.sources or []

    # --- Routing checks ---
    for agent_key in case.expect_agents:
        result.check(
            f"routed_to_{agent_key}",
            _sources_contain_agent(sources, agent_key),
            f"Expected {agent_key} in sources, got {sources}",
        )

    for agent_key in case.expect_not_agents:
        result.check(
            f"not_routed_to_{agent_key}",
            not _sources_contain_agent(sources, agent_key),
            f"Did NOT expect {agent_key} in sources, got {sources}",
        )

    # --- Intent check ---
    if case.expect_intent:
        result.check(
            "intent",
            resp.intent == case.expect_intent,
            f"Expected {case.expect_intent}, got {resp.intent}",
        )

    # --- Second-hop check ---
    if case.expect_second_hop is True:
        result.check(
            "second_hop_available",
            resp.second_hop_available is True,
            "Expected second-hop to be available",
        )
    elif case.expect_second_hop is False:
        result.check(
            "no_second_hop",
            resp.second_hop_available is False,
            "Expected NO second-hop",
        )

    # --- Approval check ---
    if case.expect_approval is True:
        result.check(
            "approval_created",
            resp.approval_id is not None,
            "Expected approval to be created",
        )
    elif case.expect_approval is False:
        result.check(
            "no_approval",
            resp.approval_id is None,
            "Did not expect approval",
        )

    # --- Fact checks (case-insensitive substring match) ---
    for fact in case.expect_facts:
        result.check(
            f"fact_{fact}",
            fact.lower() in answer,
            f"Expected '{fact}' in answer",
        )

    # --- Answer contains checks ---
    for term in case.expect_answer_contains:
        result.check(
            f"contains_{term}",
            term.lower() in answer,
            f"Expected '{term}' in answer",
        )

    # --- Answer absent checks ---
    for term in case.expect_answer_absent:
        result.check(
            f"absent_{term}",
            term.lower() not in answer,
            f"Did NOT expect '{term}' in answer",
        )

    # --- Graceful unknown check ---
    if case.expect_no_answer:
        is_unknown = (
            "nobody has information" in answer
            or "don't have" in answer
            or "couldn't find" in answer
            or "no information" in answer
            or "can you give me more context" in answer
            or not answer  # empty answer
        )
        result.check(
            "graceful_unknown",
            is_unknown,
            f"Expected graceful unknown, got: {answer[:120]}",
        )

    # --- Hallucination guard: answer should not be empty for non-unknown cases ---
    if not case.expect_no_answer and case.dimension != "actions":
        result.check(
            "has_answer",
            bool(answer.strip()),
            "Expected a non-empty answer",
        )

    return result


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

async def run_eval(cases: list[EvalCase] | None = None) -> list[EvalResult]:
    """Run all eval cases through the orchestrator and score them."""
    cases = cases or ALL_CASES
    results = []

    for case in cases:
        req = OrchestrateRequest(
            message=case.question,
            agent_id=COO_ID,
        )
        t0 = time.monotonic()
        resp = await orchestrate(req)
        elapsed = time.monotonic() - t0

        result = score_case(case, resp)
        result.elapsed = elapsed
        results.append(result)

    return results


def print_scorecard(results: list[EvalResult]):
    """Print a formatted scorecard to stdout."""
    # Group by dimension
    dims: dict[str, list[EvalResult]] = {}
    for r in results:
        dims.setdefault(r.case.dimension, []).append(r)

    total_pass = sum(1 for r in results if r.passed)
    total = len(results)

    print("\n" + "=" * 70)
    print("  RAVENHILL AGENT EVAL SCORECARD")
    print("=" * 70)

    for dim_name in ["routing", "chaining", "synthesis", "unknowns", "actions"]:
        dim_results = dims.get(dim_name, [])
        if not dim_results:
            continue

        dim_pass = sum(1 for r in dim_results if r.passed)
        dim_total = len(dim_results)
        pct = (dim_pass / dim_total * 100) if dim_total else 0

        bar = "=" * int(pct / 5) + "-" * (20 - int(pct / 5))
        print(f"\n  {dim_name.upper():12s} [{bar}] {dim_pass}/{dim_total} ({pct:.0f}%)")

        for r in dim_results:
            status = "PASS" if r.passed else "FAIL"
            marker = "  " if r.passed else ">>"
            print(f"    {marker} {status} {r.case.name} ({r.elapsed:.1f}s)")
            for fail in r.failed_checks:
                print(f"         ^ {fail}")

    # Overall
    pct = (total_pass / total * 100) if total else 0
    avg_time = sum(r.elapsed for r in results) / len(results) if results else 0

    print(f"\n{'=' * 70}")
    print(f"  OVERALL: {total_pass}/{total} ({pct:.0f}%)  |  Avg latency: {avg_time:.1f}s")
    print(f"{'=' * 70}\n")


# ---------------------------------------------------------------------------
# Pytest integration — each case is a separate test
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "case", ALL_CASES, ids=[c.name for c in ALL_CASES],
)
@pytest.mark.asyncio
async def test_eval(case: EvalCase):
    """Run a single eval case as a pytest test."""
    req = OrchestrateRequest(
        message=case.question,
        agent_id=COO_ID,
    )
    resp = await orchestrate(req)
    result = score_case(case, resp)

    if result.failed_checks:
        detail = "\n".join(f"  - {f}" for f in result.failed_checks)
        pytest.fail(
            f"[{case.dimension}] {case.name}\n"
            f"  Q: {case.question}\n"
            f"  Answer: {(resp.answer or '')[:200]}\n"
            f"  Sources: {resp.sources}\n"
            f"  Failures:\n{detail}"
        )


# ---------------------------------------------------------------------------
# Standalone runner with scorecard
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # When run directly, produce a full scorecard
    import sys
    sys.path.insert(0, ".")

    async def main():
        # Initialize DB
        from db import init_db, alter_table_if_needed, seed_demo_agents

        await init_db()
        await alter_table_if_needed()
        await seed_demo_agents()

        results = await run_eval()
        print_scorecard(results)

    asyncio.run(main())
