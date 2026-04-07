"""Discovery layer — topic map + closed-set key extraction for agent routing."""

import json
import logging
import re

from agents.llm_providers import call_llm, get_active_provider

log = logging.getLogger("discovery")


def build_topic_map(agents: list) -> dict[str, dict[str, str]]:
    """Build topic map from agent topic_keys and departments.

    Returns: { topic_key: { department_lower: agent_id_str } }
    """
    topic_map: dict[str, dict[str, str]] = {}
    for agent in agents:
        topic_keys = (
            agent.topic_keys if hasattr(agent, "topic_keys")
            else agent.get("topic_keys", []) if isinstance(agent, dict)
            else []
        )
        departments = (
            agent.departments if hasattr(agent, "departments")
            else agent.get("departments", []) if isinstance(agent, dict)
            else []
        )
        agent_id = (
            str(agent.id) if hasattr(agent, "id")
            else str(agent.get("id", "")) if isinstance(agent, dict)
            else ""
        )

        for key in (topic_keys or []):
            dept = departments[0].lower() if departments else "general"
            if key not in topic_map:
                topic_map[key] = {}
            topic_map[key][dept] = agent_id
    return topic_map


async def extract_topic_keys(
    question: str,
    available_keys: list[str],
    conversation_history: list[str] | None = None,
) -> list[str]:
    """LLM call to select relevant keys from closed set. Returns 1-3 keys."""
    if get_active_provider() == "mock":
        return _mock_extract_keys(question, available_keys)

    history_text = ""
    if conversation_history:
        history_text = (
            f"\nConversation history (last 3 messages): "
            f"{'; '.join(conversation_history[-3:])}"
        )

    prompt = f"""You are a routing system for an organization. Given a user's question, \
select which topics are relevant from the list below. Return ONLY keys from this list. \
Do not invent new keys.

Available topics: {json.dumps(available_keys)}

User question: "{question}"{history_text}

Return format: ["key_1", "key_2"]

Rules: Select 1-3 keys maximum. Only select keys that are directly relevant. \
If no keys match, return an empty array. Return ONLY the JSON array, nothing else."""

    try:
        response = await call_llm(
            system="You are a topic extraction system. Return ONLY a JSON array.",
            user_message=prompt,
            model_tier="fast",
            max_tokens=200,
        )
        if response is None:
            return _mock_extract_keys(question, available_keys)

        text = response.strip()
        if text.startswith("["):
            selected = json.loads(text)
        else:
            match = re.search(r'\[.*?\]', text, re.DOTALL)
            selected = json.loads(match.group()) if match else []
        # Filter to only valid keys
        return [k for k in selected if k in available_keys][:3]
    except Exception as e:
        log.warning(f"[discovery] extract_topic_keys failed: {e}")
        return _mock_extract_keys(question, available_keys)


def rank_agents(topic_map: dict, selected_keys: list[str]) -> list[str]:
    """Hash map lookup + deduplication + ranking. Returns top 2-3 agent_ids."""
    agent_scores: dict[str, int] = {}
    for key in selected_keys:
        if key in topic_map:
            for agent_id in topic_map[key].values():
                agent_scores[agent_id] = agent_scores.get(agent_id, 0) + 1

    # Sort by score descending, take top 3
    ranked = sorted(agent_scores.items(), key=lambda x: x[1], reverse=True)
    return [agent_id for agent_id, _ in ranked[:3]]


def _mock_extract_keys(question: str, available_keys: list[str]) -> list[str]:
    """Keyword-based topic extraction for mock mode."""
    q_lower = question.lower()
    selected = []

    # Map question keywords to topic keys
    keyword_map = {
        "redesign": [
            "marketplace_redesign_status", "marketplace_redesign",
            "platform_redesign", "marketplace_update",
        ],
        "marketplace": [
            "marketplace_redesign_status", "marketplace_redesign",
            "platform_redesign", "marketplace_update",
        ],
        "platform": ["marketplace_redesign", "platform_redesign"],
        "on track": [
            "marketplace_redesign_status", "sprint_progress",
            "feature_status",
        ],
        "status": ["feature_status", "sprint_progress", "stripe_vendor_status"],
        "progress": [
            "sprint_progress", "sprint_14_progress",
            "marketplace_redesign_status",
        ],
        "update": ["marketplace_update", "stripe_vendor_status"],
        "api": [
            "stripe_api_blocker", "api_dependencies", "api_integrations",
        ],
        "dependency": [
            "stripe_api_blocker", "api_dependencies", "api_integrations",
        ],
        "blocker": ["stripe_api_blocker", "blockers", "api_dependencies"],
        "blocked": ["stripe_api_blocker", "blockers", "api_dependencies"],
        "stripe": [
            "stripe_api_blocker", "stripe_vendor_status",
            "stripe_relationship", "vendor_management",
        ],
        "vendor": [
            "stripe_vendor_status", "vendor_management", "vendor_contracts",
            "vendor_evaluation_pipeline",
        ],
        "contract": ["vendor_contracts", "stripe_msa_sla", "vendor_management"],
        "partner": ["vendor_relationship", "vendor_management"],
        "sprint": [
            "sprint_14_progress", "sprint_progress", "sprint_velocity",
        ],
        "velocity": ["sprint_velocity", "sprint_progress"],
        "capacity": ["team_capacity", "team_bandwidth"],
        "bandwidth": ["team_capacity", "team_bandwidth"],
        "intern": ["team_capacity", "team_bandwidth"],
        "deploy": ["deployment_pipeline", "deployment"],
        "release": ["deployment_pipeline", "deployment"],
        "infrastructure": [
            "infrastructure_costs", "infrastructure",
        ],
        "infra": ["infrastructure_costs", "infrastructure"],
        "cost": ["infrastructure_costs", "infrastructure", "budget_allocation"],
        "feature": [
            "feature_roadmap", "feature_status", "feature_prioritization",
            "product_roadmap",
        ],
        "roadmap": ["product_roadmap", "feature_roadmap"],
        "priorities": ["q2_priorities", "company_goals"],
        "launch": [
            "launch_criteria_checklist", "launch_criteria",
            "marketplace_redesign_status", "product_launch", "launch_status",
        ],
        "product launch": [
            "product_launch", "launch_status", "launch_criteria",
            "marketplace_redesign_status",
        ],
        "go live": ["launch_criteria_checklist", "launch_criteria"],
        "onboarding": [
            "seller_onboarding_funnel", "seller_onboarding",
            "new_seller_setup", "onboarding_sop",
        ],
        "seller": [
            "seller_onboarding_funnel", "seller_onboarding",
            "seller_experience", "seller_churn_retention",
        ],
        "activation": ["seller_onboarding_funnel", "seller_onboarding"],
        "retention": ["seller_churn_retention", "seller_churn"],
        "churn": ["seller_churn_retention", "seller_churn"],
        "payout": [
            "support_ticket_breakdown", "seller_onboarding",
            "stripe_vendor_status",
        ],
        "support": [
            "support_ticket_breakdown", "support_tickets",
            "customer_support", "support_backlog",
        ],
        "ticket": [
            "support_ticket_breakdown", "support_tickets",
            "support_backlog_risk", "support_backlog", "ticket_backlog",
        ],
        "backlog": [
            "support_ticket_breakdown", "support_backlog",
            "support_backlog_risk", "ticket_backlog",
        ],
        "queue": [
            "support_ticket_breakdown", "support_backlog_risk",
            "support_backlog",
        ],
        "kpi": ["company_kpis", "kpis"],
        "metric": ["company_kpis", "kpis"],
        "hiring": ["hiring_pipeline", "hiring", "q2_ops_hiring_plan"],
        "headcount": ["hiring_pipeline", "hiring", "q2_ops_hiring_plan"],
        "roles": ["hiring_pipeline", "hiring"],
        "q2": ["q2_priorities", "q2_planning", "quarterly_planning"],
        "budget": ["budget_allocation", "budget", "company_kpis"],
        "burn": ["budget_allocation", "budget"],
        "okr": ["company_okrs_q2", "okrs", "q2_priorities"],
        "risk": [
            "q2_risks", "risks", "blockers", "stripe_api_blocker",
            "q2_priorities",
        ],
        "at risk": ["q2_risks", "risks", "blockers", "q2_priorities"],
        "biggest risk": ["q2_risks", "risks", "q2_priorities", "blockers"],
        "tech debt": ["tech_debt_auth_module", "tech_debt"],
        "ci": ["cicd_migration", "cicd_pipeline"],
        "pipeline": [
            "cicd_migration", "cicd_pipeline",
            "seller_onboarding_funnel",
        ],
        "incident": ["incident_response_sop", "incident_response"],
        "outage": ["incident_response_sop", "incident_response"],
        "review": ["code_review_turnaround", "code_review"],
        "compliance": ["kyc_compliance_deadline", "kyc_compliance"],
        "kyc": ["kyc_compliance_deadline", "kyc_compliance"],
        "verification": ["kyc_compliance_deadline", "kyc_compliance"],
        "sop": ["onboarding_sop", "process_docs"],
        "process": ["onboarding_sop", "process_docs"],
        "board": ["board_review_prep", "board_reporting"],
        "investor": ["investor_contacts", "investor_relations"],
        "design": ["design_system_migration", "designer_assignments"],
        "competitor": [
            "competitor_landscape", "competitors",
            "competitive_product_intel", "competitive_intel",
        ],
        "vendora": [
            "competitor_landscape", "competitors",
            "competitive_product_intel",
        ],
        "nps": ["seller_survey_march", "seller_survey"],
        "survey": ["seller_survey_march", "seller_survey"],
        "a/b": ["ab_test_listing_flow", "ab_test"],
        "test": ["ab_test_listing_flow", "ab_test"],
        "dispute": ["refund_dispute_rates", "refund_disputes"],
        "refund": ["refund_dispute_rates", "refund_disputes"],
        "fulfillment": ["warehouse_fulfillment_status", "fulfillment"],
        "shipping": [
            "warehouse_fulfillment_status", "fulfillment", "warehouse",
        ],
        "warehouse": ["warehouse_fulfillment_status", "warehouse"],
        "zendesk": ["vendor_evaluation_pipeline", "vendor_evaluation"],
        "intercom": ["vendor_evaluation_pipeline", "vendor_evaluation"],
        "persona": ["vendor_evaluation_pipeline", "vendor_evaluation"],
        "security": [
            "security_audit_status", "security_audit",
            "tech_debt_auth_module",
        ],
        "audit": ["security_audit_status", "security_audit"],
        "soc": ["security_audit_status", "security_audit"],
        "uptime": ["platform_performance", "performance"],
        "latency": ["platform_performance", "performance"],
        "performance": ["platform_performance", "performance"],
        "adoption": ["feature_adoption_metrics", "feature_adoption"],
        "success program": ["seller_success_program"],
        "ops hiring": ["q2_ops_hiring_plan", "q2_ops_hiring"],
    }

    for keyword, keys in keyword_map.items():
        if keyword in q_lower:
            for k in keys:
                if k in available_keys and k not in selected:
                    selected.append(k)

    return selected[:3]
