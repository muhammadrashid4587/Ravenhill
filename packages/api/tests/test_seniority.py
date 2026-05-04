"""Tests for the seniority routing primitive.

Covers role-title derivation (the regex ladder) plus the routing
filter (prefer at-or-below target, escalate with confirmation when
only higher-tier candidates exist).
"""
from __future__ import annotations

from agents.seniority import (
    derive_from_role,
    filter_candidates,
    is_at_or_below,
)


def test_derive_exec_titles():
    for title in (
        "CEO",
        "Chief Operating Officer",
        "Co-founder",
        "Founder",
        "VP of Engineering",
        "Vice President, Marketing",
        "President",
    ):
        assert derive_from_role(title) == "exec", title


def test_derive_lead_titles():
    for title in (
        "Head of Product",
        "Engineering Manager",
        "Director of Operations",
        "Tech Lead",
        "Team Lead",
    ):
        assert derive_from_role(title) == "lead", title


def test_derive_senior_titles():
    for title in (
        "Senior Software Engineer",
        "Sr. Designer",
        "Principal Engineer",
        "Staff Engineer",
        "Solutions Architect",
    ):
        assert derive_from_role(title) == "senior", title


def test_derive_junior_titles():
    for title in (
        "Junior Developer",
        "Jr. Analyst",
        "Software Engineering Intern",
        "Associate Product Manager",
        "Marketing Coordinator",
        "Entry-level Designer",
    ):
        assert derive_from_role(title) == "junior", title


def test_derive_default_mid_for_neutral_or_empty():
    for title in (None, "", "Software Engineer", "Designer", "Member"):
        assert derive_from_role(title) == "mid", repr(title)


def test_is_at_or_below_orders_correctly():
    assert is_at_or_below("junior", "mid")
    assert is_at_or_below("mid", "mid")
    assert not is_at_or_below("lead", "mid")
    assert is_at_or_below("exec", "exec")


def test_filter_prefers_at_or_below_target():
    """Junior question → pick the junior candidate, not the lead."""
    candidates = [
        ("a-junior", "junior"),
        ("a-mid", "mid"),
        ("a-lead", "lead"),
    ]
    decision = filter_candidates(candidates, target_tier="mid", requester_tier="mid")
    assert "a-lead" not in decision.chosen_ids
    # mid-tier match is the closest to target_tier=mid; junior is acceptable too.
    assert decision.chosen_ids[0] == "a-mid"
    assert not decision.requires_confirmation


def test_filter_escalates_with_confirmation_when_only_higher_tier_matches():
    """Only exec candidates available, requester is mid → must confirm."""
    candidates = [("a-exec", "exec")]
    decision = filter_candidates(candidates, target_tier="mid", requester_tier="mid")
    assert decision.chosen_ids == ["a-exec"]
    assert decision.requires_confirmation
    assert decision.reason == "escalating_above_target"


def test_exec_to_exec_skips_confirmation():
    """Peer exec routing doesn't need a confirmation gate."""
    candidates = [("a-exec", "exec")]
    decision = filter_candidates(candidates, target_tier="mid", requester_tier="exec")
    assert decision.chosen_ids == ["a-exec"]
    assert not decision.requires_confirmation


def test_filter_empty_candidates_returns_empty():
    decision = filter_candidates([], target_tier="mid", requester_tier="mid")
    assert decision.chosen_ids == []
    assert decision.reason == "no_candidates"


def test_filter_caps_at_max_results():
    candidates = [("a", "mid"), ("b", "mid"), ("c", "mid"), ("d", "mid")]
    decision = filter_candidates(
        candidates, target_tier="mid", requester_tier="mid", max_results=2
    )
    assert len(decision.chosen_ids) == 2


def test_target_exec_keeps_lower_tiers_too():
    """An exec-tier question is fine to also include leads/seniors —
    the rule is at-or-below, not exact-match."""
    candidates = [
        ("a-junior", "junior"),
        ("a-lead", "lead"),
        ("a-exec", "exec"),
    ]
    decision = filter_candidates(candidates, target_tier="exec", requester_tier="exec")
    # All three are at-or-below "exec".
    assert set(decision.chosen_ids) == {"a-junior", "a-lead", "a-exec"}
    assert not decision.requires_confirmation
