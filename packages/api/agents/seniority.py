"""Seniority — tier-aware routing primitives.

Three concerns live here:

1. The 5-tier ladder (`junior` < `mid` < `senior` < `lead` < `exec`) and
   ordering helpers.
2. `derive_from_role(title)` — best-effort regex match from a role
   string to a seniority tier. Used on signup so a brand-new agent
   gets a non-default seniority without needing manual setup.
3. `filter_candidates(...)` — the routing rule. Given a list of
   candidate agents and a `target_tier` (the level the question seems
   to need), keep agents at or below the target. Higher-tier agents
   are kept ONLY when no lower-tier candidate exists, and surface a
   `requires_confirmation` flag the orchestrator can act on.

Keep this module dependency-light (no DB, no LLM) so the rules are
easy to unit-test and reason about.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Literal

Seniority = Literal["junior", "mid", "senior", "lead", "exec"]
TIER_ORDER: dict[str, int] = {
    "junior": 0,
    "mid": 1,
    "senior": 2,
    "lead": 3,
    "exec": 4,
}


# Role-title regexes, evaluated in declaration order. First match wins.
#
# Order matters: junior comes first because downgrade prefixes
# ("Associate Product Manager", "Junior Engineering Lead") should
# beat the role's own seniority signal. Then exec (clear authority
# words). Then lead (manager-class — the "Manager" in "Senior
# Engineering Manager" should beat the "Senior" prefix). Finally
# senior (experienced IC).
_RULES: tuple[tuple[Seniority, re.Pattern[str]], ...] = (
    (
        "junior",
        re.compile(
            r"\b("
            r"junior|jr\.?|associate|intern|trainee|coordinator|"
            r"assistant|entry[-\s]level"
            r")\b",
            re.IGNORECASE,
        ),
    ),
    (
        "exec",
        re.compile(
            r"\b("
            r"ceo|cto|cfo|coo|cio|cpo|cmo|cso|chro|founder|co-?founder|"
            r"president|chair(person)?|owner|chief\s+\w+\s+officer|"
            r"vp|vice[-\s]president|svp|evp"
            r")\b",
            re.IGNORECASE,
        ),
    ),
    (
        "lead",
        re.compile(
            r"\b("
            r"head\s+of|director|dir\.|"
            r"manager|mgr\.?|"
            r"team\s+lead|tech\s+lead|engineering\s+lead|product\s+lead|"
            r"design\s+lead|ops\s+lead"
            r")\b",
            re.IGNORECASE,
        ),
    ),
    (
        "senior",
        re.compile(
            r"\b("
            r"senior|sr\.?|principal|staff|distinguished|architect"
            r")\b",
            re.IGNORECASE,
        ),
    ),
)


def derive_from_role(title: str | None) -> Seniority:
    """Best-guess seniority from a role string. Falls through to `mid`
    for anything that doesn't clearly match — middle of the ladder is
    the safest default since it lets routing prefer it for everyday
    questions but escalates only when explicitly needed.
    """
    if not title:
        return "mid"
    for tier, pattern in _RULES:
        if pattern.search(title):
            return tier
    return "mid"


def is_at_or_below(candidate: Seniority, target: Seniority) -> bool:
    """True iff `candidate`'s tier is no higher than `target`."""
    return TIER_ORDER[candidate] <= TIER_ORDER[target]


@dataclass
class RoutingDecision:
    """Outcome of `filter_candidates`. The orchestrator reads
    `chosen_ids` for who to actually send to, and surfaces a
    confirmation prompt to the human when `requires_confirmation` is
    set (we're about to escalate up the chain).
    """
    chosen_ids: list[str]
    requires_confirmation: bool
    reason: str


def filter_candidates(
    candidates: Iterable[tuple[str, Seniority]],
    target_tier: Seniority,
    requester_tier: Seniority,
    max_results: int = 3,
) -> RoutingDecision:
    """Pick who to actually route to.

    Rules, in order:
    1. Prefer candidates at or below `target_tier`. If any exist, route
       to those (sorted: closest match to target first, ties broken by
       lower seniority).
    2. If only higher-tier candidates exist (e.g. a junior-tier
       question, but the only matching agents are exec), keep them but
       set `requires_confirmation=True`. The orchestrator should
       surface a "Confirm: send this to <Name> (CEO)?" gate.
    3. Special case: if the requester is themselves `exec`, skip the
       confirmation — execs can talk to other execs without a gate.
    """
    by_id_tier = list(candidates)
    if not by_id_tier:
        return RoutingDecision(
            chosen_ids=[], requires_confirmation=False, reason="no_candidates"
        )

    target_rank = TIER_ORDER[target_tier]
    requester_rank = TIER_ORDER[requester_tier]

    # Split into "at or below target" vs "above".
    at_or_below = [(aid, t) for aid, t in by_id_tier if TIER_ORDER[t] <= target_rank]
    above = [(aid, t) for aid, t in by_id_tier if TIER_ORDER[t] > target_rank]

    if at_or_below:
        # Closer to target wins (smaller positive distance below).
        # Tie: lower seniority preferred (less burdensome to ping).
        ranked = sorted(
            at_or_below,
            key=lambda pair: (target_rank - TIER_ORDER[pair[1]], TIER_ORDER[pair[1]]),
        )
        return RoutingDecision(
            chosen_ids=[aid for aid, _ in ranked[:max_results]],
            requires_confirmation=False,
            reason="matched_at_or_below_target",
        )

    # Only above-target options. Surface confirmation unless the
    # requester is also exec (peer routing).
    ranked_above = sorted(above, key=lambda pair: TIER_ORDER[pair[1]])
    must_confirm = requester_rank < TIER_ORDER["exec"]
    return RoutingDecision(
        chosen_ids=[aid for aid, _ in ranked_above[:max_results]],
        requires_confirmation=must_confirm,
        reason="escalating_above_target",
    )
